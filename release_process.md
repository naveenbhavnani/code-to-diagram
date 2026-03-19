# Release Process

## Before Uploading to Canva

1. Bump the `version` field in `package.json` to the new version number (e.g., `"5"`)
2. Commit the version bump and any final changes
3. Create a release branch: `git branch release/v<version>` (e.g., `git branch release/v5`)
4. Tag the commit: `git tag v<version>` (e.g., `git tag v5`)
5. Build the app: `npm run build`
6. Upload the `dist` directory to Canva via the Developer Portal

## After Upload

Continue development on `master`. The release branch stays frozen as a snapshot of the submitted code.

## Useful Commands

- Compare two releases: `git diff v4..v5`
- View code at a specific release: `git checkout release/v4`
- List all releases: `git tag` or `git branch --list 'release/*'`
