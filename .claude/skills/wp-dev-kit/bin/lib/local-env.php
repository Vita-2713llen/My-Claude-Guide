<?php
/**
 * Prints shell lines `export …` that recreate the Local → "Open site shell" environment for the site
 * that contains the given WordPress root. Then wp, mysql, php and composer work from any
 * terminal (and from Claude Code), not only from the site shell.
 *
 *   eval "$(<php Local> bin/lib/local-env.php "/Users/me/Local Sites/site/app/public")"
 *   <php Local> bin/lib/local-env.php --list    # all sites: name, wp-content, status, PHP, kit, git
 *
 * Changes nothing. If the site is not from Local or something is not found, prints only `# …` and exports nothing.
 */

$wpRoot = $argv[1] ?? '';
$home   = getenv('HOME') ?: '';
$local  = $home . '/Library/Application Support/Local';
$app    = '/Applications/Local.app/Contents/Resources/extraResources/bin';

function out_comment(string $m): void { echo '# ', $m, "\n"; exit(0); }
function out_export(string $k, string $v): void { echo 'export ', $k, '=', escapeshellarg($v), "\n"; }

if ($wpRoot === '--list') {
    $sites    = json_decode((string) @file_get_contents("$local/sites.json"), true);
    $statuses = json_decode((string) @file_get_contents("$local/site-statuses.json"), true);
    if (!is_array($sites)) out_comment('Local not found (sites.json)');
    echo "# name\twp-content\tstatus\tphp\tkit\tgit-remote\n";
    foreach ($sites as $id => $s) {
        $p = (string) ($s['path'] ?? '');
        if (str_starts_with($p, '~')) $p = $home . substr($p, 1);
        $wc  = "$p/app/public/wp-content";
        $kit = is_file("$wc/.deploy/KIT_VERSION") ? trim((string) file_get_contents("$wc/.deploy/KIT_VERSION")) : '-';
        $git = '-';
        if (is_file("$wc/.git/config") && preg_match('/\[remote "origin"\][^\[]*?url\s*=\s*(\S+)/s', (string) file_get_contents("$wc/.git/config"), $m)) $git = $m[1];
        elseif (is_dir("$wc/.git")) $git = 'no-remote';
        echo implode("\t", [$s['name'] ?? $id, $wc, $statuses[$id] ?? 'unknown', $s['services']['php']['version'] ?? '?', $kit, $git]), "\n";
    }
    exit(0);
}

$root = realpath($wpRoot);
if ($root === false) out_comment("no such folder $wpRoot");
$sites = json_decode((string) @file_get_contents("$local/sites.json"), true);
if (!is_array($sites)) out_comment('Local not found (sites.json)');

$site = null;
foreach ($sites as $id => $s) {
    $p = (string) ($s['path'] ?? '');
    if ($p === '') continue;
    if (str_starts_with($p, '~')) $p = $home . substr($p, 1);
    if (realpath("$p/app/public") === $root) { $site = $s; $site['id'] = $id; break; }
}
if ($site === null) out_comment("no Local site found for $root");

$id = $site['id'];
// A service's bin folder: lightning-services/<name>-<version>+<build>/bin/<platform>/bin
$bin = function (string $role) use ($site, $local): string {
    foreach (($site['services'] ?? []) as $svc) {
        $name = (string) ($svc['name'] ?? '');
        $isRole = ($svc['role'] ?? '') === $role || $name === $role;
        if (!$isRole) continue;
        $want = PHP_OS_FAMILY === 'Darwin'
            ? (php_uname('m') === 'arm64' ? ['darwin-arm64', 'darwin'] : ['darwin', 'darwin-x64'])
            : ['linux'];
        foreach ($want as $plat) {
            $g = glob("$local/lightning-services/$name-" . ($svc['version'] ?? '') . "+*/bin/$plat/bin", GLOB_ONLYDIR);
            if ($g) return $g[0];
        }
    }
    return '';
};
$php = $bin('php');
$db  = $bin('db');
if ($php === '') out_comment('the site\'s PHP not found in Local');

$path = [$php];
if ($db !== '') $path[] = $db;
foreach (["$app/wp-cli/posix", "$app/composer/posix"] as $d) if (is_dir($d)) $path[] = $d;

$statuses = json_decode((string) @file_get_contents("$local/site-statuses.json"), true);
out_export('LOCAL_SITE_ID', $id);
out_export('LOCAL_SITE_NAME', (string) ($site['name'] ?? $id));
out_export('LOCAL_SITE_STATUS', (string) ($statuses[$id] ?? 'unknown'));
out_export('MYSQL_HOME', "$local/run/$id/conf/mysql");
out_export('PHPRC', "$local/run/$id/conf/php");
out_export('MYSQL_UNIX_PORT', "$local/run/$id/mysql/mysqld.sock"); // mysql client (wp db …) without my.cnf
if (is_file("$app/wp-cli/config.yaml")) out_export('WP_CLI_CONFIG_PATH', "$app/wp-cli/config.yaml");
out_export('WP_CLI_DISABLE_AUTO_CHECK_UPDATE', '1');
echo 'export PATH=', escapeshellarg(implode(':', $path)), '":$PATH"', "\n";
