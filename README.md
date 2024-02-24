# gitopscon-2024-na-demo

![Architecture Diagram of GitOps Flow with Gitops Bridge and Pulumi](assets/gitopscon-na24.png)

### File Structure

```
root/
  .github/ # Contains Github Actions to deploy and preview Pulumi IaC
  gitops/ # Contains Gitops Configuration
    addons/ # Contains the Application Set Files and Addons we want
      platform/ # Contains the platform level addons we want
      team/ # Contains the Application Team addons we want
    bootstrap/ # Contains the bootstrap application to deploy cluster secrets and applicationsets
    charts/ # Contains Helm Charts and default values for configuration
      platform/ # Contains Platform Helm Charts and default values
      team/ # Contains Application Team Helm Charts and default values
    clusters/ # Contains the cluster secret files
    overrides/ # Contains Values file overrides
      clusters/ # Contains Values file overrides for specific cluster
      environments/ # Contains Values file overrides for specific cluster environments
  pulumi/ # Contains the Pulumi code for the repository
    bootstrap.sh # The bootstrap command to run to setup the hub cluster
    Pulumi.hub.yaml # Contains configuration for the Pulumi Stack "hub"
    Pulumi.dev.yaml # Contains configuration for the Pulumi Stack "dev"
```