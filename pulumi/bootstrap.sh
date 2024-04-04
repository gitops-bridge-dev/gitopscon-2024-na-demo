#!/bin/bash
set -ueo pipefail

# Add EKS cluster to kubeconfig
aws eks --region us-east-1 update-kubeconfig --name hub-cluster --alias hub-cluster

# Install ArgoCD
helm repo add argo https://argoproj.github.io/argo-helm || true
helm repo update
helm upgrade --install argocd argo/argo-cd --namespace argocd --create-namespace --wait

kubectl create secret generic private-repo-creds -n argocd \
    --from-literal=username=REPLACE_USERNAME \
    --from-literal=password=$GITHUB_TOKEN \
    --from-literal=type=git \
    --from-literal=url=https://github.com/csantanapr/gitopscon-2024-na-demo-carlos \
    --dry-run=client -o yaml | \
    sed "s/namespace: argocd/namespace: argocd\n  labels:\n    argocd.argoproj.io\/secret-type: repository/" | \
    kubectl apply -f -

sleep 60
# Deploy Application Set
kubectl apply -f "../gitops/bootstrap/bootstrap-app.yaml"

# Echo command to port forward ArgoCD and get admin password
echo "To port forward ArgoCD run: kubectl -n argocd port-forward svc/argocd-server 8080:443 &"
echo "Username: admin"
echo "Password: $(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" --context hub-cluster | base64 -d)"
echo "Access https://localhost:8080"
echo "To port forward ArgoCD run: kubectl -n argocd port-forward svc/argocd-server 8080:443 --context hub-cluster"