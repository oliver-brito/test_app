# generate-localhost-certs.ps1
# Generates HTTPS certificates for localhost using mkcert

# Fail if mkcert is not found
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Error "mkcert is not installed. Install it from https://github.com/FiloSottile/mkcert"
    exit 1
}

# Go to repo root (adjust path as needed)
Set-Location "C:\Users\Oliver\Documents\testApp\test_app"

# Create certs directory if it doesn't exist
New-Item -ItemType Directory -Path ".\certs" -Force | Out-Null

# Generate certs directly into ./certs
mkcert -key-file ".\certs\localhost-key.pem" `
       -cert-file ".\certs\localhost-cert.pem" `
       localhost 127.0.0.1 ::1

Write-Host "Certificates generated in 'certs' folder"
