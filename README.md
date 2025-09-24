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

AUTH_PATH=/app/WebAPI/v2/session/authenticateUser
UPCOMING_PATH=/app/WebAPI/v2/content
MAP_PATH=/app/WebAPI/v2/map
PERFORMANCE_PATH=/app/WebAPI/v2/performance
ORDER_PATH=/app/WebAPI/v2/order

HTTPS_PORT=3443
HTTPS_KEY=./certs/localhost-key.pem
HTTPS_CERT=./certs/localhost-cert.pem
```

And then run
```bash
npm start
```

go to the **https** localhost running.

Note: Use event 01, configure it to have Adyen CC and select that payment method and pick up later.
