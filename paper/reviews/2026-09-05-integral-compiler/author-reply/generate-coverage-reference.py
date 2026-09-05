"""Generate independent high precision fixtures (mpmath==1.3.0, no app deps).

Closed-form erf + endpoint recurrences at 80/100 decimal digits. Selected
cases are also checked by phase-resolved 60-digit Gauss-Legendre quadrature.
Inputs are the EXACT binary64 numbers Node receives, not ideal decimal values.
"""
import json
import math
from pathlib import Path
import mpmath as mp

HERE = Path(__file__).resolve().parent
CASES = json.loads((HERE / 'coverage-cases.json').read_text())


def inputs(args):
    # mp.mpf(float) preserves that binary float exactly at this precision.
    s = mp.mpf(float(args.get('sigma', 1)))
    a = mp.mpf(float(args.get('a', -math.inf))) / s
    b = mp.mpf(float(args.get('b', math.inf))) / s
    B = mp.mpf(float(args.get('beta', 0))) * s
    Q = mp.mpf(float(args.get('q', 0))) * s * s
    norm = 1 if args.get('normalized', True) else mp.sqrt(2 * mp.pi) * s
    return a, b, B, Q, [norm, norm * s, norm * s * s]


def closed(args, precision):
    with mp.workdps(precision):
        a, b, B, Q, scales = inputs(args)
        if a == b:
            return [mp.mpc(0)] * 3
        D = 1 - 1j * Q
        root = mp.sqrt(D)
        def erf_at(t):
            if mp.isinf(t):
                return mp.sign(t)
            return mp.erf((root * t - 1j * B / root) / mp.sqrt(2))
        def density(t):
            return mp.mpc(0) if mp.isinf(t) else mp.exp(-D * t*t/2 + 1j*B*t) / mp.sqrt(2*mp.pi)
        fa, fb = density(a), density(b)
        m0 = mp.exp(-B*B/(2*D)) * (erf_at(b) - erf_at(a)) / (2*root)
        m1 = (1j*B*m0 - (fb-fa)) / D
        boundary = (0 if mp.isinf(b) else b*fb) - (0 if mp.isinf(a) else a*fa)
        m2 = (m0 + 1j*B*m1 - boundary) / D
        return [m*scale for m, scale in zip([m0, m1, m2], scales)]


def quadrature(args):
    with mp.workdps(60):
        a, b, B, Q, scales = inputs(args)
        sign = 1
        if a > b:
            a, b, sign = b, a, -1
        # |tail moment j<=2| at 18 sigma is below 7e-70, well below the gate.
        a, b = max(a, -mp.mpf(18)), min(b, mp.mpf(18))
        if a >= b:
            return [mp.mpc(0)] * 3
        max_phase_slope = max(abs(B+Q*a), abs(B+Q*b))
        n = max(1, int(mp.ceil((b-a) * max(1, max_phase_slope/8))))
        points = [a+(b-a)*k/n for k in range(n+1)]
        return [sign*scale*mp.quadgl(lambda t: t**j * mp.exp(-t*t/2+1j*(B*t+Q*t*t/2))/mp.sqrt(2*mp.pi), points)
                for j, scale in enumerate(scales)]


rows = []
for case in CASES:
    low = closed(case['args'], 80)
    high = closed(case['args'], 100)
    with mp.workdps(100):
        precision_difference = max(abs(x-y) for x, y in zip(low, high))
        assert precision_difference < mp.mpf('1e-60'), (case['id'], precision_difference)
        row = dict(case)
        row['moments'] = [[mp.nstr(z.real, 65), mp.nstr(z.imag, 65)] for z in high]
        row['precision_difference'] = mp.nstr(precision_difference, 8)
    if case.get('quadrature'):
        quad = quadrature(case['args'])
        with mp.workdps(100):
            difference = max(abs(x-y) for x, y in zip(high, quad))
            assert difference < mp.mpf('1e-47'), (case['id'], difference)
            row['quadrature_difference'] = mp.nstr(difference, 8)
    rows.append(row)
    print(case['id'], flush=True)

(HERE / 'coverage-reference.json').write_text(json.dumps({
    'generator': 'mpmath 1.3.0: complex erf + endpoint moments, 80/100 dps; selected Gauss-Legendre 60 dps',
    'reference_note': 'Each decimal input converted to binary64 before exact mpmath conversion; stored output has 65 significant decimal digits.',
    'cases': rows,
}, indent=2) + '\n')
