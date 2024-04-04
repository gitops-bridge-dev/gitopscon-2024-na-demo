import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";
import * as yaml from 'js-yaml';
import { getValue } from "./utils.js"
import { env } from "process";

export class GitOpsClusterConfig {
  private config: pulumi.Config;
  private outputs: {[key: string]: pulumi.Output<any>};

  constructor(outputs: {[key: string]: pulumi.Output<any>}, config: pulumi.Config, clusterAuthority: pulumi.Output<string>) {
    this.config = config
    this.outputs = outputs
    const annotations = this.generateAnnotations(pulumi.getStack())
    const serverConfig = this.generateConfig(clusterAuthority)
    getValue(pulumi.all([annotations, serverConfig]).apply(([annotations, serverConfig]) => {
      return {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          labels: this.generateLabels(),
          annotations: annotations,
          name: `${pulumi.getStack()}-cluster-secret`,
          namespace: "argocd",
        },
        type: "Opaque",
        stringData: {
          name: pulumi.getStack(),
          server: config.require("clusterType") === "hub" ? "https://kubernetes.default.svc" : `https://${annotations.k8s_service_host}`
        },
        data: {
          config: Buffer.from(serverConfig).toString("base64"),
        },
      }
    })).then(fileContents => {
      const provider = new github.Provider("github", {
        token: env.GITHUB_TOKEN,
        owner: config.require("githubOrg"),
      })
      new github.RepositoryFile("argo-cluster-secret.yaml", {
        repository: config.require("githubRepo"),
        file: config.require("secretPath"),
        content: yaml.dump(fileContents),
        branch: "main",
        commitMessage: `Update Argo Config Secret for ${pulumi.getStack()}`,
        overwriteOnCreate: true,
      }, {provider: provider});
    })
    .catch(err => console.log(err))
  }

  private generateConfig(clusterAuthority: pulumi.Output<string>) {
    if (this.config.require("clusterType") !== "hub") {
      return pulumi.all([this.outputs.argoRoleArn, this.outputs.clusterName, clusterAuthority]).apply(([argoRoleArn, clusterName, clusterAuthority]) => `{
  "awsAuthConfig": {
    "clusterName": "${clusterName}",
    "roleARN": "${argoRoleArn}"
  },
  "tlsClientConfig": {
    "insecure": false,
    "caData": "${clusterAuthority}"
  }
}
`)
  }
  return `{
  "tlsClientConfig": {
    "insecure": false
  }
}
`
  }

  private generateAnnotations(name: string) {
    // Add More Outputs as needed to output to cluster secret
    const outputs = pulumi.all([
      this.outputs.clusterName,
      this.outputs.clusterApiEndpoint,
      this.outputs.veleroBucket,
      this.outputs.veleroIamRoleArn,
      this.outputs.addons_repo_url,
      this.outputs.addons_repo_revision,
      this.outputs.aws_region,
      this.outputs.aws_account_id,
      this.outputs.velero_namespace,
      this.outputs.velero_service_account,
      this.outputs.velero_backup_s3_bucket_prefix,
    ])
    const annotations = outputs.apply(([
      clusterName,
      clusterApiEndpoint,
      veleroBucket,
      veleroIamRoleArn,
      addons_repo_url,
      addons_repo_revision,
      aws_region,
      aws_account_id,
      velero_namespace,
      velero_service_account,
      velero_backup_s3_bucket_prefix,
    ]) => {
      return {
        "aws_cluster_name": clusterName,
        "k8s_service_host": clusterApiEndpoint.split("://")[1],
        "velero_backup_s3_bucket_name": veleroBucket,
        "velero_iam_role_arn": veleroIamRoleArn,
        "addons_repo_url": addons_repo_url,
        "addons_repo_revision": addons_repo_revision,
        "aws_region": aws_region,
        "aws_account_id": aws_account_id,
        "velero_namespace": velero_namespace,
        "velero_service_account": velero_service_account,
        "velero_backup_s3_bucket_prefix": velero_backup_s3_bucket_prefix
      }
    })
    return annotations
  }

  private generateLabels() {
    return {
      "argocd.argoproj.io/secret-type": "cluster",
      "environment": this.config.require("environment"),
      ...this.config.requireObject<Object>("clusterComponents"),
    }
  }
}