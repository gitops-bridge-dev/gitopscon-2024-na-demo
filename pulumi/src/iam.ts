import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export function createSpokeRole(config: pulumi.Config) {
  const hubStack = new pulumi.StackReference("hub-argorole-ref", {
    name: config.require("hubStackName")
  })
  const outputs = hubStack.getOutput("outputs") as pulumi.Output<{ [key: string]: string }>
  const policy = outputs.apply((outputs) => JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: outputs.argoRoleArn
        },
        Action: ["sts:AssumeRole", "sts:TagSession"]
      }
    ]
  }))
  return new aws.iam.Role("argo-role", {
    assumeRolePolicy: policy
  })
}

export function createHubRole(clusterName: pulumi.Output<string>) {
  const assumeRole = aws.iam.getPolicyDocument({
    statements: [{
      effect: "Allow",
      principals: [{
        type: "Service",
        identifiers: ["pods.eks.amazonaws.com"],
      }],
      actions: [
        "sts:AssumeRole",
        "sts:TagSession",
      ],
    }],
  });

  const iamRole = new aws.iam.Role("argo-hub-role", {
    assumeRolePolicy: assumeRole.then(assumeRole => assumeRole.json),
  });
  const policy = aws.iam.getPolicyDocument({
    statements: [{
      effect: "Allow",
      actions: ["sts:AssumeRole", "sts:TagSession"],
      resources: ["*"],
    }],
  });
  const policyPolicy = new aws.iam.Policy("argo-hub-role", {
    policy: policy.then(policy => policy.json),
  });
  const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("argo-hub-role", {
    role: iamRole.name,
    policyArn: policyPolicy.arn,
  });


  const controllerPodIdentityAssociation = new aws.eks.PodIdentityAssociation("argo-controller", {
    clusterName: clusterName,
    namespace: "argocd",
    serviceAccount: "argocd-application-controller",
    roleArn: iamRole.arn,
  });

  const apiPodIdentityAssociation = new aws.eks.PodIdentityAssociation("argo-server", {
    clusterName: clusterName,
    namespace: "argocd",
    serviceAccount: "argocd-server",
    roleArn: iamRole.arn,
  });

  return iamRole;
}

