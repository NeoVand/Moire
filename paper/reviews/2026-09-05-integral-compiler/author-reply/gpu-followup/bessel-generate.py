"""Build the bounded Taylor table using exact rational coefficient enclosures.

Python standard library only. Outputs a new timestamped directory by default;
--out DIR selects a new/empty output directory. Does not overwrite existing files.
The generated bessel-table.f32 is little endian, [center/2][order][power].
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction as F
import hashlib
import json
import math
from pathlib import Path
import struct
import time

HERE = Path(__file__).resolve().parent
DEGREE, ORDER, CENTERS = 12, 42, list(range(0, 41, 2))
START = time.perf_counter()
args = argparse.ArgumentParser()
args.add_argument('--out', type=Path)
args = args.parse_args()
out = args.out or HERE / ('bessel-table-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
out.mkdir(parents=True, exist_ok=True)
if any(out.glob('bessel-*')):
    raise SystemExit('Output already contains bessel files; choose a fresh --out directory.')


def enclosure(n, c):
    """Exact interval for J_n(c), c an even nonnegative integer.

    Once term magnitudes decrease, the alternating remainder lies between
    zero and the first omitted term. All work up to those endpoints is exact.
    """
    if c == 0:
        v = F(int(n == 0))
        return v, v
    h = c // 2
    term = F(h**n, math.factorial(n))
    total = term
    m = 0
    while True:
        following = -term * F(h*h, (m+1)*(n+m+1))
        if abs(following) < F(1, 2**200) and h*h < (m+1)*(n+m+1):
            return min(total, total+following), max(total, total+following)
        total += following
        term = following
        m += 1
        assert m < 1000


def upper_float(r):
    return math.nextafter(float(r), math.inf)


def lower_float(r):
    return math.nextafter(float(r), -math.inf)


raw = bytearray()
largest_coef_error = F(0)
largest_row_error = F(0)
largest_row_l1 = F(0)
largest_horner_round = F(0)
largest_total = F(0)
worst = None
all_rows = []
eps, tiny = F(1, 2**23), F(1, 2**126)
remainder = F(1, math.factorial(DEGREE+1))

for center in CENTERS:
    base = [enclosure(n, center) for n in range(ORDER+DEGREE+1)]
    def signed(n):
        lo, hi = base[abs(n)]
        return (-hi, -lo) if n < 0 and n % 2 else (lo, hi)
    for n in range(ORDER+1):
        q = []
        errors = []
        for d in range(DEGREE+1):
            lo = hi = F(0)
            for k in range(d+1):
                a, b = signed(n-d+2*k)
                weight = F((-1)**k * math.comb(d,k), 2**d * math.factorial(d))
                lo += min(weight*a, weight*b)
                hi += max(weight*a, weight*b)
            value = struct.unpack('<f', struct.pack('<f', float((lo+hi)/2)))[0]
            exact_stored = F.from_float(value)
            coef_error = max(abs(exact_stored-lo), abs(exact_stored-hi))
            raw.extend(struct.pack('<f', value))
            q.append(abs(exact_stored))
            errors.append(coef_error)
            largest_coef_error = max(largest_coef_error, coef_error)
        row_error, row_l1 = sum(errors), sum(q)
        largest_row_error = max(largest_row_error, row_error)
        largest_row_l1 = max(largest_row_l1, row_l1)
        # Exact worst-case absolute-error propagation for |h| <= 1.
        # Each multiply/add has |fl(v)-v| <= eps*|v|+3*tiny.
        # This also covers all operand/result FTZ effects in this magnitude
        # range. q coefficients are the exact stored values, not ideal ones.
        magnitude, error = q[-1], F(0)
        for j in range(DEGREE-1,-1,-1):
            product_error = error + eps*(magnitude+error) + 3*tiny
            next_mag = magnitude + q[j]
            error = product_error + eps*(next_mag+product_error) + 3*tiny
            magnitude = next_mag
        largest_horner_round = max(largest_horner_round,error)
        total = remainder + row_error + error
        if total > largest_total:
            largest_total, worst = total, {'center':center,'order':n}
        all_rows.append({'center':center,'order':n,
            'coefficient_l1_error_upper':upper_float(row_error),
            'horner_roundoff_upper':upper_float(error),
            'total_absolute_error_upper':upper_float(total)})

table = out / 'bessel-table.f32'
table.write_bytes(raw)
# Q'=(J[n-1]-J[n+1])/2 and Q''=(J[n-2]-2J[n]+J[n+2])/4.
# Bounds below include roundoff under the same up-or-down/FTZ arithmetic
# model, using |J| <= 1 and the largest proved single-value error.
E = largest_total
d1 = E + eps*(1+E) + 4*tiny
d2 = E + F(7,4)*eps*(1+E) + F(3,4)*eps*eps*(1+E) + 8*tiny
summary = {
    'format':'float32 little-endian; index=((centerIndex*43+absOrder)*13+power)',
    'degree':DEGREE,'maxOrder':ORDER,'maxArgument':40,'centers':CENTERS,
    'floats':len(raw)//4,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
    'coefficientConstruction':'Exact rational alternating-series enclosures narrower than 2^-200; exact adjacent-order derivative combinations; exact stored float32 comparison.',
    'argumentContract':'Error relative to the actual finite float32 argument x in [-40,40]. No input-construction error included.',
    'uniformAnalyticTaylorRemainder':upper_float(remainder),
    'maxStoredCoefficientAbsoluteError':upper_float(largest_coef_error),
    'maxRowCoefficientL1Error':upper_float(largest_row_error),
    'maxRowStoredCoefficientL1':upper_float(largest_row_l1),
    'maxHornerArithmeticError':upper_float(largest_horner_round),
    'singleValueAbsoluteErrorBound':upper_float(E),
    'unitAmplitudeQDerivativeAbsoluteErrorBounds':[upper_float(E),upper_float(d1),upper_float(d2)],
    'worstRow':worst,
    'arithmeticAssumptions':[
        'The displayed Horner operation graph (ordinary multiply then add), or a contraction at least as accurate.',
        'Basic f32 arithmetic rounds to either adjacent representable number; epsilon=2^-23.',
        'Subnormal operands/results may flush to zero; each basic operation receives a conservative 3*2^-126 absolute allowance.',
        'Argument reduction chooses c=2*floor(abs(x)/2), incremented when abs(x)-c>1; x-c is exact (Sterbenz, or c=0).',
        'No uncontrolled fast-math reassociation that changes the analyzed operation graph; WGSL allows reassociation, so arbitrary GPU compilation is not certified by this analysis alone.',
    ],
    'boundNotCovered':['Miller recurrence roundoff or termination','Sideband truncation','Other warp/lighting composition','Whole-pixel recipe summation','Host-to-f32 argument error','Arbitrary nonconforming or reassociated GPU arithmetic'],
    'generatedUTC':datetime.now(timezone.utc).isoformat(),'seconds':time.perf_counter()-START,
    'rows':all_rows,
}
(out/'bessel-table-certificate.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='rows'},indent=2))
print(out)
