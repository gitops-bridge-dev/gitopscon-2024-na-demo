import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";
import { createArgoRole } from "./iam.js"
import { GitOpsClusterConfig } from "./github.js"
import { createVeleroResources } from "./components.js"

const stackName = pulumi.getStack()
const config = new pulumi.Config()

let roleMappings: eks.RoleMapping[] = []

export const outputs: {[key: string]: any} = {
  "stackName": stackName,
}

// VPC Config
const vpc = new awsx.ec2.Vpc("vpc", {
  cidrBlock: config.require("cidrBlock"),
  numberOfAvailabilityZones: 3,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  natGateways: {
    strategy: awsx.ec2.NatGatewayStrategy.Single,
  },
  subnetSpecs: [
    {
      type: awsx.ec2.SubnetType.Private,
      tags: {
        "karpenter.sh/discovery": `${stackName}-cluster`,
        [`kubernetes.io/cluster/${stackName}-cluster`]: "owned",
        "kubernetes.io/role/internal-elb": "1",
      },
    },
    {
      type: awsx.ec2.SubnetType.Isolated,
      name: "tgw-attachment-subnet",
      cidrMask: 27,
    },
    {
      type: awsx.ec2.SubnetType.Public,
      tags: {
        [`kubernetes.io/cluster/${stackName}-cluster`]: "owned",
        "kubernetes.io/role/elb": "1",
      },
    },
  ],
  tags: {
    "name": stackName,
  },
})

// If we are creating a spoke cluster we need to create argoRole first, ensure it
// gets added to auth mapping for the cluster with the correct permissions
if (config.require("clusterType") === "spoke") {
  const argoRole = createArgoRole(config.require("awsAccountId"), pulumi.output(""), config)
  roleMappings.push({
    roleArn: argoRole.arn,
    username: argoRole.arn,
    groups: ["system:masters"],
  })
  outputs.argoRoleArn = argoRole.arn
}

// Create EKS Cluster with a default node group
const eksCluster = new eks.Cluster(`${stackName}-cluster`, {
  name: `${stackName}-cluster`,
  vpcId: vpc.vpcId,
  version: "1.29",
  publicSubnetIds: vpc.publicSubnetIds,
  privateSubnetIds: vpc.privateSubnetIds,
  roleMappings: roleMappings,
  nodeSecurityGroupTags: {
    "karpenter.sh/discovery": `${stackName}-cluster`
  },
  createOidcProvider: true,
  clusterTags: {
    "karpenter.sh/discovery": `${stackName}-cluster`,
  },
  nodeGroupOptions: {
    nodeSubnetIds: vpc.privateSubnetIds,
    nodeRootVolumeEncrypted: true,
    nodeRootVolumeType: "gp3",
    instanceType: "t3.medium",
    minSize: 1,
    maxSize: 25,
    desiredCapacity: 4,
  },
  tags: {
    "name": stackName,
  },
},{
  transformations: [args => {
    if (args.type === "aws:eks/cluster:Cluster") {
      args.props["accessConfig"] = {
        authenticationMode: "API_AND_CONFIG_MAP"
      };
    }
    return undefined;
  }]
})

outputs.clusterName = eksCluster.eksCluster.name
outputs.clusterApiEndpoint = eksCluster.core.endpoint

const oidcProviderUrl = eksCluster.core.oidcProvider?.url as pulumi.Output<string>
const { veleroIamRole, veleroBucket } = createVeleroResources(config.require("awsAccountId"), oidcProviderUrl, config.require("name"))
outputs.veleroBucket = veleroBucket.bucket,
outputs.veleroIamRoleArn = veleroIamRole.arn

// If we are creating the hub cluster we need pods in eks cluster to be able to assume
// so we need cluster created first
if (config.require("clusterType") === "hub") {
  const argoRole = createArgoRole(config.require("awsAccountId"), oidcProviderUrl, config)
  outputs.argoRoleArn = argoRole.arn
}

// Create the GitOps Configuration for the given cluster, upload
// a file to be added to Github Repo which GitOps Controller could manage
new GitOpsClusterConfig(outputs, config, eksCluster.eksCluster.certificateAuthority.data)