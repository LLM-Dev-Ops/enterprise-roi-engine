const { evaluate } = require('./boundary.cjs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

async function main() {
  const [baseline, candidate, toolsRoot, output] = process.argv.slice(2).map(p => path.resolve(p));
  const fw = await import(path.join(toolsRoot, 'node_modules/@metaharness/flywheel/dist/index.js'));
  const sha = root => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const parent = sha(baseline), head = sha(candidate);
  const measurements = {};
  const evaluator = async policy => {
    const root = policy.revision === head ? candidate : baseline;
    const start = performance.now();
    const probes = await evaluate(root);
    let suitePassed = true;
    try { execFileSync('npm', ['test', '--', '--runInBand', '--silent'], { cwd: root, timeout: 20000, stdio: 'ignore' }); }
    catch { suitePassed = false; }
    const wins = probes.holdout.filter(Boolean).length;
    measurements[policy.revision] = { ...probes, suitePassed };
    return { primary: wins / probes.holdout.length, noopRate: 1 - wins / probes.holdout.length,
      costPerWin: (performance.now() - start) / 1000 / Math.max(wins, 1),
      regressed: !suitePassed || !probes.anchors.every(Boolean), itemWins: probes.holdout };
  };
  const result = await fw.runFlywheelGenerations({ rootPolicy: { revision: parent },
    proposer: async () => ({ value: head, summary: 'Bounded ROI HTTP boundary', inverse: {
      path: 'git-revision', parentBytes: parent, hash: createHash('sha256').update(parent).digest('hex') } }),
    evaluator, promotionRule: fw.meetsPromotionRule,
    holdout: { id: 'roi-http-boundary-v1', items: [1, 2, 3, 4, 5, 6, 7] },
    anchor: { id: 'health-route-json-and-full-suite-v1', items: [1, 2, 3] },
    mutationTargets: ['revision'], maxGenerations: 1, signer: fw.makeSigner(), dataSource: 'LIVE' });
  const replay = fw.verifyReplayBundle(result.replayBundle, { pinnedGateFingerprint: fw.gateFingerprint(fw.meetsPromotionRule) });
  const report = { parent, head, measurements, gateFingerprint: fw.gateFingerprint(fw.meetsPromotionRule),
    commits: result.replayBundle.all_commits.map(c => ({ verdict: c.verdict, failureReasons: c.failureReasons, primaryDelta: c.primaryDelta, mutation: c.mutation })),
    replay: { pass: replay.pass, chainSummary: replay.chainSummary }, finalPolicy: result.finalPolicy,
    replayBundle: result.replayBundle };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, replayBundle: undefined }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
