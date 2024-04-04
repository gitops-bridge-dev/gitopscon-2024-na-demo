#!/usr/bin/env bash
set -euo pipefail
[[ -n "${DEBUG:-}" ]] && set -x

# The following variables are set by Github Actions
# GITHUB_REPOSITORY_OWNER
# GITHUB_REPOSITORY
# PULUMI_ACCOUNT
# PULUMI_PROJECT
# PULUMI_STACK_NAME
# VELERO_BACKUP_BUCKET

pulumi stack select ${PULUMI_STACK_NAME}
pulumi config set githubOrg ${GITHUB_REPOSITORY_OWNER}
pulumi config set githubRepo $(echo "${GITHUB_REPOSITORY}" | cut -d '/' -f2)
pulumi config set veleroBucketPrefix ${VELERO_BACKUP_BUCKET}
if [ ${PULUMI_STACK_NAME} != "hub" ]; then
  pulumi config set hubStackName ${PULUMI_ACCOUNT}/${PULUMI_PROJECT}/hub
fi
cat stacks/Pulumi.${PULUMI_STACK_NAME}.yaml