<?php
/**
 * GitHub webhook → Cloudways "Deployment via Git" Pull.
 *
 * A copy of this file lives on the server in public_html/gitautodeploy.php (NOT in Git: Git deploys only wp-content).
 * Fill in the constants below directly on the server. The repository keeps a clean template without keys.
 *
 * GitHub (company account) → repository → Settings → Webhooks → Add webhook:
 *   Payload URL:   https://<app domain>/gitautodeploy.php
 *   Content type:  application/json
 *   Secret:        the same string as in WEBHOOK_SECRET
 *   Events:        Just the push event
 *
 * GitHub sends the webhook on EVERY push. Pull runs only on a push to BRANCH (deploy/dev) — that push is made by
 * GitHub Actions when the build is ready. Pushes to working branches (DEV_BRANCH/PROD_BRANCH) and others are ignored (202).
 * Result of each call: GitHub → Settings → Webhooks → the webhook → Recent Deliveries → Response.
 */

const CW_EMAIL       = '';                                // Cloudways account email
const CW_API_KEY     = '';                                // Cloudways → API Integration → API Key
const SERVER_ID      = '';                                // from the app URL: …/server/<SERVER_ID>/application/<APP_ID>
const APP_ID         = '';
const GIT_URL        = 'git@github.com:COMPANY/REPO.git'; // as in Deployment via Git
const BRANCH         = 'deploy/dev';                      // PROD app: deploy/prod
const DEPLOY_PATH    = 'wp-content';                      // without this Cloudways deploys the branch into public_html!
const WEBHOOK_SECRET = '';                                // long random string, the same one in GitHub

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

function finish(int $code, string $msg): void
{
    http_response_code($code);
    echo $msg, "\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    finish(405, 'Only POST (GitHub webhook).');
}
foreach (['CW_EMAIL', 'CW_API_KEY', 'SERVER_ID', 'APP_ID', 'WEBHOOK_SECRET'] as $c) {
    if (constant($c) === '') {
        finish(500, "Not filled in: $c in gitautodeploy.php on the server.");
    }
}
if (str_contains(GIT_URL, 'COMPANY/REPO')) {
    finish(500, 'Not filled in: GIT_URL in gitautodeploy.php on the server.');
}

// GitHub signature: without the correct Secret no outsider can trigger a Pull
$body = (string) file_get_contents('php://input');
$sig  = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
if (!hash_equals('sha256=' . hash_hmac('sha256', $body, WEBHOOK_SECRET), $sig)) {
    finish(403, 'Signature mismatch: Secret in GitHub ≠ WEBHOOK_SECRET.');
}

$event = (string) ($_SERVER['HTTP_X_GITHUB_EVENT'] ?? '');
if ($event === 'ping') {
    finish(200, 'pong — webhook connected, signature valid.');
}
if ($event !== 'push') {
    finish(202, "Skipped: event $event (push required).");
}

$data = json_decode($body, true);
if (!is_array($data)) { // Content type: application/x-www-form-urlencoded
    parse_str($body, $form);
    $data = json_decode((string) ($form['payload'] ?? ''), true);
}
$ref = is_array($data) ? (string) ($data['ref'] ?? '') : '';
if ($ref !== 'refs/heads/' . BRANCH) {
    finish(202, "Skipped: push to $ref. Pull only on refs/heads/" . BRANCH . ' (pushed by GitHub Actions after the build).');
}
if (!empty($data['deleted'])) {
    finish(202, 'Skipped: branch deleted.');
}

// GitHub waits ~10 s for a response; if it disconnects earlier, the script still completes the request
ignore_user_abort(true);
set_time_limit(60);

function cw(string $path, array $fields, string $token = ''): array
{
    $headers = ['Accept: application/json'];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    $ch = curl_init('https://api.cloudways.com/api/v1' . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($fields),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => 30,
    ]);
    $out  = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (!is_string($out) || $code >= 400) {
        finish(502, "Cloudways API $path → HTTP $code " . curl_error($ch) . ' ' . (is_string($out) ? $out : ''));
    }
    $json = json_decode($out, true);
    return is_array($json) ? $json : [];
}

$token = (string) (cw('/oauth/access_token', ['email' => CW_EMAIL, 'api_key' => CW_API_KEY])['access_token'] ?? '');
if ($token === '') {
    finish(502, 'Cloudways returned no token: check CW_EMAIL / CW_API_KEY.');
}
$res = cw('/git/pull', [
    'server_id'   => SERVER_ID,
    'app_id'      => APP_ID,
    'git_url'     => GIT_URL,
    'branch_name' => BRANCH,
    'deploy_path' => DEPLOY_PATH,
], $token);

finish(200, 'Pull ' . BRANCH . ' → ' . DEPLOY_PATH . ' started: ' . json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
