# Oracle Cloud hooks for the shared mallakhamb-* scripts (deploy/COMMON.md C4.5, deploy/oci/PLAN.md O7.1).
# Installed as /etc/mallakhamb/platform.sh (root:root 0644). Sourced, never executed.
export OCI_CLI_AUTH=instance_principal
OCI=/opt/oci-cli/bin/oci
# Pulled over SSH with a READ-ONLY GitHub deploy key (/root/.ssh/mallakhamb_deploy, COMMON.md C4.4),
# so it works while the repo is private. Never give this key write access: Render deploys master.
# Fallback without the key: REPO_URL="/opt/mallakhamb/mallakhamb.bundle" (a git bundle copied over the Bastion).
REPO_URL="git@github.com:angreatharva/mallakhamb.git"
GIT_SSH_COMMAND="ssh -i /root/.ssh/mallakhamb_deploy -o IdentitiesOnly=yes"
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
