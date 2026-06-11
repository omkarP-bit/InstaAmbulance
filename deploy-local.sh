#!/bin/bash

# Ensure Minikube is running and use its docker environment
echo "Setting up Minikube environment..."
eval $(minikube docker-env)

# Build the local Docker image
echo "Building local image..."
docker build -t instaambulance:latest .

# Apply Kubernetes configurations
echo "Applying Kubernetes manifests..."
kubectl apply -f infrastructure/kubernetes/

# Restart deployment to pull the new image
echo "Restarting deployment..."
kubectl rollout restart deployment/instaambulance -n instaambulance || echo "Deployment not found, might need initial 'kubectl apply' to create it."

echo "Deployment complete."
