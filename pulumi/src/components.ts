import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export function createVeleroResources(awsAccountId: string, oidcProviderUrl: pulumi.Output<any>, stackName: string) {
  const config = new pulumi.Config()
  const bucketPrefix = config.require("veleroBucketPrefix")
  const bucket = new aws.s3.Bucket("velero-bucket", {
    bucket: `${bucketPrefix}-${stackName}`,
    acl: "private",
    versioning: {
      enabled: true,
    }
  })

  const iamRole = new aws.iam.Role("velero-role", {
    assumeRolePolicy: oidcProviderUrl.apply(v => JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Federated: `arn:aws:iam::${awsAccountId}:oidc-provider/${v}`
          },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringLike: {
              [`${v}:sub`]: "system:serviceaccount:velero:velero"
            }
          }
        }
      ]
    })),
    inlinePolicies: [
      {
        name: "velero",
        policy: bucket.arn.apply(v => JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "veleroBucketAccess",
              Action: [
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:PutObject",
                "s3:AbortMultipartUpload",
                "s3:ListMultipartUploadParts"
              ],
              Effect: "Allow",
              Resource: `${v}/*`
            },
            {
              Sid: "veleroListBucketAccess",
              Action: [
                "s3:ListBucket"
              ],
              Effect: "Allow",
              Resource: `${v}`
            },
            {
              Sid: "veleroEbsAccess",
              Action: [
                "ec2:DescribeVolumes",
                "ec2:DescribeSnapshots",
                "ec2:CreateTags",
                "ec2:CreateVolume",
                "ec2:CreateSnapshot",
                "ec2:DeleteSnapshot"
              ],
              Effect: "Allow",
              Resource: "*"
            },
          ]
        }))
      },
    ]
  })

  return {
    veleroIamRole: iamRole,
    veleroBucket: bucket
  }
}