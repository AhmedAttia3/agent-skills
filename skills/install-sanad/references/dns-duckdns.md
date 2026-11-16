# DNS with DuckDNS

DuckDNS is a free dynamic-DNS provider that suits a lab host: one label, one
token, no card, and no dashboard needed once the token exists. This guide covers
only what a host preparation needs; other providers get their own guide.

## 1. What it gives and what it costs

- **Wildcard for free.** Any name under `<LABEL>.duckdns.org` resolves to the
  account address, so one label covers unlimited projects and a new service needs
  no new record.
- **A hard cap on labels.** An account holds a small fixed number of labels; plan
  names instead of creating one per experiment.
- **Weak reputation.** Do not use this domain for email or as a production brand;
  it is fine for demos, internal tools, and staging.

## 2. Account and label

Sign in with any offered identity provider, then create a label of your own; the
result is `<LABEL>.duckdns.org`. Choose it with the user, because it is public and
appears in certificates.

Two things can block a browser-driven signup, and both need the human rather than
retries:

- **Identity verification.** A sign-in provider may ask the person to confirm a
  number shown on screen using their phone. Read that number to the user and wait;
  never guess it or attempt to bypass the check.
- **Bot checks.** On a datacentre address the captcha can answer "too low" and keep
  the page on the challenge. Retrying the challenge two to four times with short
  pauses usually passes. Treat one failure as noise; do not create a second
  account to get around it.

Stop before any password field and let the user complete it. If a browser is used,
never kill the browser process mid-signup: a crashed session in the persisted
profile loses the login and forces the whole flow again.

## 3. Token

The account page shows one API token for the entire account. Have the user place
it in a root-only file, not in the chat:

```bash
sudo install -m 600 -o root -g root /dev/null <TOKEN_FILE>
sudoedit <TOKEN_FILE>   # paste, save, close
```

The token controls every label on the account, so treat it as the account's DNS
authority: never place it in a script the unprivileged account can read, and
revoke it from the account page if it may have leaked.

## 4. Writing records through the API

One call sets the address and can also set a validation value:

```bash
curl -s "https://www.duckdns.org/update?domains=<LABEL>&token=<TOKEN>&ip=<PUBLIC_IPV4>&verbose=true"
curl -s "https://www.duckdns.org/update?domains=<LABEL>&token=<TOKEN>&txt=<VALUE>"
```

The reply is `OK` or `KO`, and `verbose=true` adds the address and whether it
changed. There is no read API, so confirm through public resolution instead:

```bash
dig +short <LABEL>.duckdns.org @1.1.1.1
dig +short TXT _acme-challenge.<LABEL>.duckdns.org @1.1.1.1
```

When a minimal image has no `dig`, resolve with the interpreter instead:

```bash
python3 -c "import socket; print(socket.gethostbyname('<NAME>.duckdns.org'))"
```

Check the apex **and** one wildcard name (including a deeper one) before going
further. If the wildcard names do not resolve, everything after that point is
wasted work.

Clearing validation is explicit and also clears the address, so never clear while
another name is still waiting for validation:

```bash
curl -s "https://www.duckdns.org/update?domains=<LABEL>&token=<TOKEN>&txt=&clear=true"
```

## 5. The one-value limit, and what it forces

This provider keeps a **single** validation value per label, and a second write
replaces the first without reporting an error. Two consequences:

- A certificate covering both the apex and a wildcard is impossible here: both
  names validate against the same `_acme-challenge` name and need two values at
  the same time. Issue two certificates and give the wildcard its own certificate
  storage so it does not overwrite the apex.
- A validation loop that alternates between success and failure is the signature
  of this limit, not a network problem. Waiting longer never fixes it, and each
  retry burns the certificate rate limit.

The wildcard certificate does not cover the bare label, and the apex certificate
does not cover subdomains, so every server block must name the matching pair.
Confirm what a certificate actually covers before trusting it:

```bash
openssl x509 -in <CERT> -noout -subject -issuer -dates -ext subjectAltName
```

## 6. What a good result looks like

The apex resolves to the host's public address, wildcard names resolve to the
same address, both certificates are installed at distinct paths, and renewal is
scheduled because the validation value has to be rewritten on every renewal.
