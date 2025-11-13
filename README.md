Run the script to generate certificates (or use ngrok):
```bash
./generate_certs.ps1
```

Then install dependencies
```bash
npm install
```

Configure the ```.env``` file with the correct data:

```
API_BASE=avon_url
UNL_USER=user
UNL_PASSWORD=pass
PORT=3000

HTTPS_PORT=3443
```

And then run
```bash
npm start
```

go to the **https** localhost running.

Note: Use event 01, configure it to have Adyen CC and select that payment method and pick up later.
