# 🚀 Git Tracker (gitracker)

> [!NOTE]
> This app was made in 1.5 hours please forgive any issues, during testing there were 0 issues (Javascript testing). Feel free to create a github issue if you want me to add any logos to the public build.

> [!IMPORTANT]
> Any issues? Email `me@snowyjs.lol` or contact me on discord @ `snowyjs`. I would love to help!
> If you don't want to do either of them simply make a new issue [Here](https://github.com/snowypy/Gitracker/issues/new)

## Setting up Git Tracker:

### PT1: Setting up your environment:
  1. To begin you will need to clone this repo, to do this run `git clone https://github.com/snowypy/gitracker`.
  2. You then need to rename the `.env-example` file to `.env`, A guide to setting up the `.env` can be found in PT2.

### PT2: Configuring your environment variables:
  1. `GITHUB_WEBHOOK_SECRET` - This is the secret that is used to make sure that github is making the requests to your public endpoint.
  2. `DISCORD_WEBHOOK_URL` - This is the discord webhook that the embed will be sent to after Gitracker has made it look nicer.
  3. `PORT` - By default this is 3000 however you may not have access to this point depending on where you host this.
  4. `PUBLIC_URL` - This is where the embed on discord will fetch the lang icons from. It is recommended not to set this to your ip if you are running it locally as this could result in ip leaking. If running on a host it should look something like this: `http://dedi1.snowy.codes:3000`
  5. `GITHUB_PAT` - This is the Github Access Token which grants your app access to the github api for tracking line changes etc, for instructions on how to setup the access tokens and why they are needed scroll to the bottom of the read me.

### PT3: Running Gitracker:
  1. Make sure you have NodeJS + npm installed on your PC
  2. run `npm install`
  3. run `node bot.js`
  4. 🔥Your webhook is now setup! **But** we still need to setup github end webhooks.

### PT4: Setting up github webhooks:
  1. Go to the repo you want to set this up for. In this example I will be using `Gitracker`. 
  2. You should then go to the Webhook settings for that repo. Example: https://github.com/<org/pa>/<repo-name>/settings/hooks/new
  3. You should then set the payload url to your `PUBLIC_URL` followed by `/webhook`. Example: `http://dedi1.snowy.codes:3000/webhook`
  4. You should then set the payload type to `application/json` if it isn't already.
  5. Set the 'Secret' value to your `GITHUB_WEBHOOK_SECRET` value otherwise authentication will fail.
  6. Set the 'Trigger Events' box to 'Send me everything.'
  7. Make sure the box at the end says **Active**
  8. Click 'Create Webhook'
  9. 🔥Your github webhook is now setup! Try making a new commit and if configured correctly it should send a pretty commit embed to your discord channel.

## Why do we use Github Access Tokens?

> [!NOTE]
> We use Github Access Tokens (PATs) to allow elevated access into the Github API so that you can see details such as line changes which are not sent via the json. When setting up your access token there is a rule of thumb that I usually follow:
>   1. If this were to get into the wrong hands what would happen? Due to this I only give access tokens neccesary permissions which in this is just read access to the repos, commits and files.
>   2. I usually set the expire time for each PAT around 30 days just in case it were to get into the wrong hands and I was unaware. This is defined when setting up the PAT

> [!NOTE]
> To setup your own PAT go to [Developer Options](https://github.com/settings/tokens?type=beta) and click 'Generate new token'.
>   1. Name it 'gitracker' and set the description and expire time as you wish.
>   2. Copy the key it gives you and store it somewhere safe AND in your `GITHUB_PAT` value
>   3. 🔥 Your access token is now setup!

# Examples:
![image](https://github.com/user-attachments/assets/7dcf2ab6-1a8d-4707-a242-c4b71c3820c7) ![image](https://github.com/user-attachments/assets/469a7605-5d67-44e7-9806-7123ac956230)
![image](https://github.com/user-attachments/assets/6c1a5b8c-fd0a-4109-ac75-c77d801d5116) ![image](https://github.com/user-attachments/assets/33d4018c-64d4-435f-9097-c06637b72b30)




