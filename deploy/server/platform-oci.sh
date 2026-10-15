# Oracle Cloud hooks for the shared mallakhamb-* scripts (deploy/COMMON.md C4.5, deploy/oci/PLAN.md O7.1).
# Installed as /etc/mallakhamb/platform.sh (root:root 0644). Sourced, never executed.
export OCI_CLI_AUTH=instance_principal
OCI=/opt/oci-cli/bin/oci
# The repo is private and has no deploy key yet: code arrives as a git bundle copied over the
# Bastion (see install.sh). Switch to the GitHub URL + GIT_SSH_COMMAND once a read-only deploy key exists.
REPO_URL="/opt/mallakhamb/mallakhamb.bundle"
# REPO_URL="git@github.com:angreatharva/mallakhamb.git"
# GIT_SSH_COMMAND="ssh -i /root/.ssh/mallakhamb_deploy -o IdentitiesOnly=yes"
SECRET_OCID="__SECRET_OCID__"          # mallakhamb-prod-bom-secret-api-env, set by install.sh
OS_NAMESPACE="bmfuwns4gjjr"
BACKUP_BUCKET="mallakhamb-prod-bom-bkt-backups"

fetch_env_file() {
  "$OCI" secrets secret-bundle get --secret-id "$SECRET_OCID" \
      --query 'data."secret-bundle-content".content' --raw-output | base64 -d
}
upload_backup() {   # $1 local file, $2 object name
  "$OCI" os object put --namespace "$OS_NAMESPACE" --bucket-name "$BACKUP_BUCKET" \
      --file "$1" --name "$2" --no-overwrite >/dev/null
}
