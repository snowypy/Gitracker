# 🚀 Git Tracker (gitracker)

> [!IMPORTANT]
> Any issues? Email `me@snowyjs.lol` or contact me on discord @ `snowyjs`. I would love to help!
> If you don't want to do either of them simply make a new issue [Here](https://github.com/snowypy/Gitracker/issues/new)

## Setting up Git Tracker:

## As of v1.1.0 we now use GitHub Actions!

> [!NOTE]
> You can deploy Gitracker [Here](https://github.com/marketplace/actions/push-via-gitracker)
> You will need to set up one secret in your repository settings, `DISCORD_WEBHOOK_URL`. To do so, go to your repository settings, then secrets, then new repository secret. Name it `DISCORD_WEBHOOK_URL` and paste your webhook URL in the value box.  

# Example Workflow File:

```yaml
name: CI

on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    
      - name: Push via Gitracker
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        uses: snowypy/Gitracker@master
```

# Examples:
![image](https://github.com/user-attachments/assets/7dcf2ab6-1a8d-4707-a242-c4b71c3820c7) ![image](https://github.com/user-attachments/assets/469a7605-5d67-44e7-9806-7123ac956230)
![image](https://github.com/user-attachments/assets/6c1a5b8c-fd0a-4109-ac75-c77d801d5116) ![image](https://github.com/user-attachments/assets/33d4018c-64d4-435f-9097-c06637b72b30)




