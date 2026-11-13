Clean templates of the files that are configured per project.
bin/kit-install.sh uses them only if these files do not exist in the project yet:
  gitignore         → .gitignore
  targets           → .deploy/targets
  environments.conf → .deploy/environments.conf
  sync.conf         → .deploy/sync.conf
Do not edit these for a project — edit the files themselves.
