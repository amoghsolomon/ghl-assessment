# Deployment

This repo publishes a single container image for the Hono API and compiled Vue web component.

The deployment flow is:

1. Push to `main` or run the workflow manually.
2. GitHub Actions runs on GitHub-hosted `ubuntu-latest`.
3. The workflow builds the Docker image.
4. The workflow pushes two GHCR tags:
   - `ghcr.io/amoghsolomon/ghl-assessment:<commit-sha>`
   - `ghcr.io/amoghsolomon/ghl-assessment:main`
5. Argo CD Image Updater in the k3s cluster detects the new 40-character SHA tag.
6. Image Updater updates the Argo CD Application Helm parameters:
   - `image.repository`
   - `image.tag`
7. Argo CD syncs the new image into Kubernetes.
