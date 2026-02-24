---
description: Deploy to GitHub and Vercel after making changes
---

// turbo-all

After completing any code changes, always run this deploy workflow:

1. Stage all changes:
```
git add -A
```

2. Commit with a descriptive message summarizing what changed:
```
git commit -m "<concise summary of changes>"
```

3. Push to GitHub:
```
git push origin main
```

4. Deploy to Vercel production:
```
npx vercel --prod
```

All commands should be run from the project root: `/Users/mmooslechner/Downloads/Projects/Democracy/Script Writer`
