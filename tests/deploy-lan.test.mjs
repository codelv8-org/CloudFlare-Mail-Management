import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = resolve(root, 'scripts/deploy-lan.sh');
const remote = resolve(root, 'scripts/deploy-release-remote.sh');

function attemptDeployment(overrides = {}) {
  const env = {
    ...process.env,
    DEPLOY_SHA: 'a'.repeat(40),
    DEPLOY_HOST: '192.168.10.50',
    DEPLOY_USER: 'deploy',
    DEPLOY_SSH_PORT: '22',
    DEPLOY_ROOT: '/www/wwwroot/relaydesk',
    DEPLOY_SSH_KEY_FILE: '/nonexistent/runner-key',
    DEPLOY_SSH_KNOWN_HOSTS: '/nonexistent/known-hosts',
    ...overrides,
  };
  return spawnSync('bash', [local], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
}

test('deployment scripts have valid Bash syntax', () => {
  for (const file of [local, remote]) {
    const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('LAN runner deployment fails closed when SSH credentials are unavailable', () => {
  const result = attemptDeployment();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SSH private key file is unreadable/);
});

test('LAN runner rejects shell metacharacters in the host', () => {
  const result = attemptDeployment({ DEPLOY_HOST: '192.168.10.50;touch /tmp/bad' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DEPLOY_HOST/);
});

test('LAN runner rejects traversal in the deployment directory', () => {
  const result = attemptDeployment({ DEPLOY_ROOT: '/www/wwwroot/../relaydesk' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DEPLOY_ROOT/);
});

test('deployment workflow restricts self-hosted runner to private main-branch CI pushes', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/deploy-lan.yml'), 'utf8');
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /repository\.private == true/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /head_repository\.full_name == github\.repository/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
});
