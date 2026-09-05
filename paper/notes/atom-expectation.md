# A1. The expectation of a Gaussian atom under the pixel window

Claim A1 of [theory-program.md](theory-program.md), derived 2026-09-05. Status: derived, awaiting the collaborator's review.

## Setting

Count space has coordinates u in R^2. An atom is a Gaussian envelope of width w centred at u_c with a linear phase of frequency kappa (cycles a count) and offset psi:

    a(u) = exp(-|u - u_c|^2 / (2 w^2)) exp(i (psi + 2 pi kappa . u)).

The pixel window is N(0, S I) in pixel coordinates X, S = sigma^2. The map u(X) has the second-order jet u(X) = u0 + G X + (1/2) H[X, X], with G the 2x2 Jacobian and H the Hessian (a pair of symmetric 2x2 matrices, one per count).

## Derivation

Write delta = u0 - u_c for the atom's offset at the pixel's centre. To second order in X the envelope's exponent is

    -|delta + G X + (1/2) H[X, X]|^2 / (2 w^2) = -(|delta|^2 + 2 delta . G X + X^T M X) / (2 w^2) + O(|X|^3),
    M = G^T G + sum_j delta_j H_j,

where the cubic and quartic terms of the square are dropped. The phase's exponent to second order is

    i (psi + 2 pi kappa . u0 + b . X + (1/2) X^T Q X),  b = 2 pi G^T kappa,  Q = 2 pi sum_j kappa_j H_j.

Together with the window's exponent -X^T X / (2 S) the integrand is exp(-(1/2) X^T A X + beta^T X + c) with

    A = I / S + M / w^2 - i Q,    beta = -G^T delta / w^2 + i b,    c = -|delta|^2 / (2 w^2) + i (psi + 2 pi kappa . u0),

and the Gaussian integral over R^2, normalised by the window's 1 / (2 pi S), gives

    E[a] = exp(c) det(I + S (M / w^2 - i Q))^(-1/2) exp((1/2) beta^T A^(-1) beta).

A is a complex symmetric 2x2 matrix; its determinant and inverse are closed form, and the square root takes the branch continuous from A = I / S (the principal branch, since the real part of A is positive definite). When w -> infinity the envelope drops out and the formula is the multiplier theorem for a quadratic phase, the multC of the kernel; when Q = 0 and kappa = 0 it is the Gaussian measure of a Gaussian, the product of two Gaussians. So one routine covers the atom, the recipe and the smooth-bump cases.

## Cost

One complex 2x2 determinant, one complex 2x2 solve, one complex exponential and one complex square root: about the cost of multC plus a 2x2 solve, forty to sixty flops.

## Validity witness

Two terms were dropped. The cubic terms of the phase along X, with the same witness as the depth conditioning (the third derivative of u along the depth direction times 2.5 sigma cubed, times 2 pi |kappa|). The cubic terms of the envelope's exponent, delta . H[X, X] X-type and |H[X,X]|^2 / 4, bounded over the ball of radius 2.5 sigma by

    (|delta| |H| (2.5 sigma)^3 + |G| |H| (2.5 sigma)^3 + |H|^2 (2.5 sigma)^4 / 4) / (2 w^2),

which is small when the atom is wide compared with the jet's curvature over the footprint, the regime the atoms are for: an atom narrower than that is an edge-scale feature and belongs to the coverage branch (Track A2 decides the split). Both witnesses are computable per pixel from the jet and the atom's parameters.

## What this gives Track A

With A1 an atom costs the same as a recipe, and a node whose picture is written as edges plus atoms is evaluated as: coverage of the edges (existing), plus the sum over the atoms meeting the footprint of E[a] times the atom's coefficient, plus the mean. The number of atoms meeting a footprint is Track A3's claim. The decomposition of a picture into atoms with a bounded residual is Track A2, done once per material by the compiler.

## The prototype planned

The noise mask's transition band (1.5 to 3 cycles a pixel): decompose the indicator 1{F > t0} minus its explicit near-edge description into atoms on a Gabor frame in count space over one period cell of the field's dominant component (the field is quasi-periodic, so the frame covers a fundamental region with the atoms' coefficients computed by projection once); evaluate with A1 in the CPU harness against brute force; report error against atom count. Success is 2e-3 at under 64 atoms a pixel where the series needs 450 to 760 evaluations.
