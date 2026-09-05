import assert from 'node:assert/strict';
import { createDefaultProject } from '../types/moire.ts';
import { describeParam, displayValue, storedValue, suggestedInterval } from './paramMetadata.ts';

const scene = createDefaultProject();
const layer = scene.layers[0];
const path = (key: string) => `layer.${layer.id}.${key}`;

// Loaded motion is editable before any control registers itself, including a
// field's hidden editor and view controls that have never been opened.
layer.field = { source: 'x', amount: 2, scale: 200 };
const amount = describeParam(path('field.amount'), scene.layers)!;
assert.equal(amount.label, 'Amount');
assert.equal(describeParam('view.envelopeContrast', scene.layers)?.label, 'Contrast');
assert.equal(describeParam(path('spacing'), scene.layers)?.label, 'Spacing');
assert.equal(describeParam('layer.missing.spacing', scene.layers), undefined);

// The default must stay near the current value, rather than crossing the full
// range and flipping a positive field into a large negative one (2 -> -40).
assert.deepEqual(suggestedInterval(2, amount), { from: 2, to: 3 });
const edge = suggestedInterval(amount.max, amount);
assert.ok(edge.to < edge.from && edge.to >= amount.min);
const negative = suggestedInterval(-2, amount);
assert.ok(negative.to < 0 && negative.to > -2);

// The same path has different meaning on different families. In particular,
// wave phase is radians in the document but degrees in both motion endpoints.
layer.type = 'curve-wave';
const phase = describeParam(path('phase'), scene.layers)!;
assert.equal(displayValue(Math.PI, phase), 180);
assert.equal(storedValue(360, phase), Math.PI * 2);
assert.equal(phase.period, Math.PI * 2);
assert.ok(Math.abs(displayValue(storedValue(75, phase), phase) - 75) < 1e-12);
assert.ok(suggestedInterval(Math.PI, phase).to <= Math.PI * 2);
layer.type = 'concentric-circles';
const start = describeParam(path('phase'), scene.layers)!;
assert.equal(start.label, 'Start');
assert.equal(storedValue(360, start), 360);
assert.equal(start.period, undefined);
const rotation = describeParam(path('rotation'), scene.layers)!;
assert.equal(rotation.period, 360);
assert.ok(suggestedInterval(540, rotation).to > 540);
assert.equal(describeParam(path('spacing'), scene.layers)?.period, undefined);

// Image and expression fields have deliberately different ranges even if the
// field editor is closed when the source changes.
layer.field.image = 'data:image/png;base64,example';
assert.equal(describeParam(path('field.amount'), scene.layers)?.max, 2);
assert.equal(describeParam(path('field.scale'), scene.layers)?.max, 2400);
assert.equal(describeParam(path('field.soften'), scene.layers)?.label, 'Edges');
delete layer.field.image;
assert.equal(describeParam(path('field.scale'), scene.layers)?.max, 600);

// Discrete controls retain their integer contract at the storage boundary.
for (const key of ['lineCount', 'sides']) {
  const desc = describeParam(path(key), scene.layers)!;
  assert.equal(desc.quantize, 'int');
  assert.equal(storedValue(5.6, desc), 6);
}
assert.equal(storedValue(17.4, describeParam('view.envelopeTaps', scene.layers)!), 17);
console.log('Motion metadata: hidden controls, modest bounds, units and integer values pass.');
