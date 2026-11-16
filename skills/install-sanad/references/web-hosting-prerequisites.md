# Preparing a Host to Publish Web Services

Use this preparation route when the user wants the host to serve websites or
applications on real hostnames over HTTPS, and to hand development to an Agent
that works without administrative rights afterwards. It covers the decisions
that need privileges once: DNS, certificates, the web server, and the firewall.
It is not needed for a host that only runs an Agent.

The shape to aim for is one privileged preparation pass, then an unprivileged
delegation pass. Everything an ordinary deployment needs later — writing a site
configuration, restarting a service — must work without `sudo`, or the Agent
stalls on every change.

## 1. Ask before touching anything

Confirm three things in one exchange, because each changes the work:

1. **What gets published:** hostnames, and whether each is a static site or an
   application that must run as a process or container.
2. **DNS:** does the user already own a domain, or will they create a free
   subdomain? Ask for the provider name, never for the token itself.
3. **Exposure:** publishing means ports 80 and 443 become reachable from the
   internet. Say that plainly and get approval; if the user only needs HTTPS,
   plan to open 443 and use 80 briefly for validation.

Do not create DNS records, issue certificates, or open ports before that
approval. A certificate is rate limited and a DNS record is visible to the
world, so neither is a harmless experiment.

## 2. Get a DNS token the right way

The token is the user's credential, created in the provider's own dashboard. The
Agent never types account passwords and never fabricates a token.

- Point the user at the provider's own instructions for creating the token, or
  at a bundled provider guide when one exists; ask them to paste it into a root-only
  file rather than into the chat.
- Store it as `<TOKEN_FILE>` with mode `600`, owned by root, and read it at run
  time. Never commit it, never place it in a script the unprivileged account can
  read, and never echo it in logs or reports.
- Prefer a token scoped to the single domain when the provider allows it, and
  tell the user how to revoke and rotate it.

A token written into a deploy script is a standing credential leak: the account
that runs the Agent can read that file, so any compromise of an Agent session
exposes DNS control for every hostname on the domain.

## 3. Create the records and prove them

Create the hostname records the plan needs: an apex for the main site and a
wildcard when subdomains are expected, so a new service does not need a new DNS
record each time. Then verify from the public internet, not from the host:

```bash
dig +short <HOSTNAME>
dig +short TXT _acme-challenge.<HOSTNAME>
```

If validation records do not appear, stop and inspect the provider response
instead of retrying issuance. Repeated failed attempts burn the certificate
rate limit, not just time.

## 4. Issue certificates

DNS validation is the only method that can cover a wildcard, and it needs no
inbound port. Keep two facts in mind:

- **Apex and wildcard are separate names.** A wildcard certificate does not cover
  the bare hostname. If the provider can hold only one validation value at a
  time, one certificate covering both is impossible; issue two certificates and
  install them at distinct paths, giving the wildcard its own certificate
  storage so it does not overwrite the apex.
- **Rate limits are real.** Certificate authorities cap repeated issuance for the
  same set of names and per account per week. Test with the staging endpoint
  first when the configuration is new, and only then issue for real.

Install the certificate into a web-server path the server can read, keep the
private key owner-only, and make renewal automatic. Verify after install that a
plain HTTP request redirects to HTTPS, and that the served chain is complete.

## 5. Serve with one web server and one rule per hostname

Run a single web server and give each hostname its own server block: the apex
uses the apex certificate, every subdomain uses the wildcard certificate. Turn
off version banners, remove the distribution's default page, keep access and
error logs rotating, and redirect HTTP to HTTPS rather than serving content on
both.

Then give the unprivileged account exactly one drop point: a directory of
configuration files that a watcher copies into place and reloads on change. That
single convention is what lets the Agent publish without `sudo`:

```
<HOME>/.sanad/sites/<name>.conf   ->   watched, validated, copied, reloaded
```

The watcher must validate the configuration before applying it and must refuse a
broken file instead of taking the site down.

Run [scripts/web-hosting-setup.sh](../scripts/web-hosting-setup.sh) once with root
to create that directory, install the watcher, and remove the stock default page.
It is idempotent, prints the steps that remain privileged, and touches neither DNS
nor certificates nor the firewall. Copy
[scripts/site.conf.template](../scripts/site.conf.template) for each site instead
of writing a server block from memory.

Prove the unprivileged path before handing over: write a trivial server block as
the publishing account, wait a few seconds, request it with the hostname in the
`Host` header against the loopback address, then delete the file and confirm the
site is gone. If that does not work, the drop point or the watcher is wrong, and
no amount of DNS or certificate work will fix it.

A reusable server block keeps each site short: plain HTTP redirects permanently to
HTTPS, the TLS block names the certificate that matches that hostname, and the
application is reached over loopback with the forwarding headers a framework
expects.

```nginx
server {
    listen 80;
    server_name <HOSTNAME>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name <HOSTNAME>;
    ssl_certificate     <CERT_FOR_THIS_NAME>;
    ssl_certificate_key <KEY_FOR_THIS_NAME>;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass         http://127.0.0.1:<APP_PORT>;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

For a landing page with no application behind it, serve the markup directly from
the server block instead of pointing a document root at a home directory; home
directories are usually unreadable by the web server's user, and that failure
looks like a permission bug rather than a configuration choice.

## 6. Applications behind the web server

For an application that runs as a container or a process, publish it on the
loopback interface only and let the web server proxy to it. Binding an
application directly to the public interface bypasses the web server, its TLS
termination, and its logs, and it opens one more port to the internet for no
benefit.

Decide **who runs the application**, because that decides whether the Agent can
add a site without privileges:

- **A user service owned by the publishing account** is the default choice. The
  account starts, stops, and reads the logs of its own services, so adding a site
  needs no escalation. It does require lingering once
  (`loginctl enable-linger <ACCOUNT>`), otherwise those services only run while a
  session is open; that single setting is the privileged part.
- **A container with a restart policy** bound to the loopback address is the
  alternative when the application needs its own runtime. Pulling images and
  creating the container stay inside the account, but installing the container
  runtime and any group membership is a one-time privileged step.
- **A system service** works too, yet every added application then needs an
  administrator, which defeats the point of the handover.

Keep a port map next to the site configs: one loopback port per site from an
agreed range, recorded where the next person can read it. Confirm the port is
listening before reloading the web server, give the service an automatic restart
policy and a health endpoint, and treat a proxy error as the honest signal that the
application is down rather than masking it with a cached page.

## 7. Verification that actually proves it

Work in three levels, because each one rules out a different layer:

1. **Routing inside the host.** Send a request to the local web server with the
   hostname in the `Host` header, then over TLS with the hostname resolved to the
   loopback address. This proves the server block is live.
2. **Trusted chain.** Repeat the TLS request without disabling verification; a
   success means the chain is complete, not just that a certificate exists.
3. **Real reachability.** Fetch the hostname from outside the host. A request from
   the host to its own public address proves nothing, because it may never leave
   the machine; and the console's rule page is not evidence either.

What the result should look like: each hostname answers over HTTPS with the
content you expect, plain HTTP answers with a permanent redirect, the certificate
matches the hostname with a plausible expiry, a hostname with no site configured
serves nothing of yours, and the application port is reachable only locally.

Two failures are worth recognising immediately:

- **The site is configured and nothing changed.** The watcher refused to reload
  because the generated configuration failed validation. Read its journal entry
  rather than editing files blindly; the check exists so one broken site does not
  take down the rest.
- **Everything looks right and the site never answers from outside.** The two
  gates described in the provider guide are independent: the cloud rule and the
  guest firewall must both be open. Diagnose in that order instead of reinstalling
  the web server.

Report the codes and the certificate issuer you observed. Do not report success
from configuration alone.

## 8. Renewal and cleanup

Certificates must renew without human action; confirm the renewal schedule exists
right after the first issuance, because a silent expiry breaks every site at
once. When a site is removed, remove its server block and its DNS record, and
close a port that no remaining site needs.

### Optional supervised test (not the normal user journey)

Rehearse with one throwaway hostname: create it, issue with the staging endpoint,
serve a static page, verify the redirect and the certificate, then remove the
record, the server block, and the certificate. Report what was removed and
confirm the preexisting sites are unchanged.
