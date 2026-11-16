# Fast Oracle Cloud Agent Setup

Use this release-user route when the user wants Sanad Agent on Oracle Cloud
Infrastructure (OCI), including an Always Free server. Keep Client on the user's
device; install only Agent on the VM. Do not build from source or install
Flutter, Dart, or Docker.

## Contents

1. Ask little; inspect first
2. Verify an artifact exists for this host
3. Local prerequisites and account
4. Eligibility, capacity, and surprise cost
5. Choose reuse or creation
6. Create and reach the instance
7. Configure local access and verify reachability
8. Install and pair
9. Publishing a web service (optional)
10. Finish, resume, or clean up

## 1. Ask little; inspect first

Skip questions already answered. Ask at most two initial questions:

1. **Workload:** Agent and light work inside Always Free (recommended), or
   projects requiring a larger paid shape? Agent is lightweight, not
   resource-free; builds, tests, databases, and hosted projects may need more
   memory, CPU, or disk. Start with the Always Free allowance unless the user
   requests paid capacity; obtain approval of its estimated price before creating
   it.
2. **Oracle Cloud:** use an existing tenancy, prepare an existing account, or
   start from scratch? If inspection identifies the tenancy, name it for
   confirmation rather than asking a generic question.

The third and final setup request, just before installation, is the complete
**Settings → Devices sidebar heading → + → Add device** command from Sanad
Client. Accept its short-lived, single-use creation credential under the
exception in SKILL.md.
Do not ask for durable credentials, passwords, API keys, or payment details. A
plan confirmation is not another questionnaire: summarize the target and changes
and obtain informed approval once. Pause again only for an unexpected cost, an
irreversible choice, a destructive action, required human authentication, or a
failure requiring a decision.

## 2. Verify an artifact exists for this host

Before promising an install, confirm the current release publishes an Agent
artifact for this host's platform and architecture. The installer resolves that
from the release manifest and stops when exactly one public, signed match is not
found, so this check costs one command and prevents an offer that cannot be kept.

```bash
curl -fsSL <RELEASE_MANIFEST_URL> | <select component=agent, platform, architecture>
```

Require a single artifact that is public and carries a signature. Anything else
means this host cannot use the official release today. Do not request a pairing
token, create resources, or describe the install as ready before the check
passes, and do not quietly substitute a source build.

When no artifact matches, name what is missing and offer the real options: a
shape whose architecture is published, a source build on the separate developer
path, or waiting for a release that adds the architecture. Always Free ARM
shapes are the usual case for this gap, because they are the cheapest eligible
hosts and the last to receive a published build.

## 3. Local prerequisites and account

- No OCI CLI is required. The Oracle Cloud Console in a browser is sufficient for
  this route, and it keeps credentials out of the agent's hands.
- Use an `oci` CLI only when it already exists and is already configured. Never
  request, generate, copy, or store an API signing key, key fingerprint, CLI
  configuration file, tenancy password, or console password. If the CLI is not
  prepared, use the Console instead of provisioning credentials for it.
- Identify the host OS and confirm SSH availability so the instance can be
  reached later.
- Account creation, country and billing details, email verification, password,
  MFA enrollment, payment method, and the temporary card authorization hold are
  user-owned actions performed in the browser. Do not accept, type, or repeat any
  of those values. Billing country and address must match the payment instrument;
  a mismatch causes rejection or a flagged account that is hard to recover.
- Browser automation is optional, not a deployment dependency. If it is used,
  stop before any password or payment field and let the user complete it. Do not
  collect passwords or disable security controls.
- **Home region is chosen once during signup and cannot be changed afterwards.**
  Always Free resources must live in it, so an incorrect choice forces a new
  account. Confirm the region with the user before the signup is submitted, and
  treat that confirmation as the explicit approval for this irreversible choice.
  Judge candidates by the number of availability domains (more domains means more
  independent chances of ARM capacity), latency to the operator, and current
  eligibility. Naming a region as an example is not a recommendation to skip that
  confirmation.
- The free trial's credits do not change the home region and do not extend the
  Always Free allowance. Upgrading to pay-as-you-go keeps Always Free resources
  but adds billing; do it only with explicit approval.

## 4. Eligibility, capacity, and surprise cost

Read the current official [Always Free terms](https://www.oracle.com/cloud/free/)
and the service limits page. Do not promise an unconditional $0: eligibility,
limits, and region availability change, outbound traffic and block storage have
their own aggregate allowances, and model-provider billing is separate. Keep this
explanation to one short note, not a billing audit.

Current Always Free compute and storage allowances are aggregate per tenancy and
per home region, not per instance:

- Ampere A1 (ARM) compute up to a fixed combined OCPU and memory ceiling.
- A small number of AMD micro instances, separate from the A1 ceiling.
- A combined block volume allowance that includes boot volumes.
- A monthly outbound data transfer allowance.

Consequences to state plainly:

- Splitting the A1 ceiling across instances is allowed; a single instance that
  consumes the whole ceiling leaves nothing for a second one.
- Boot volumes count against the storage allowance, so an oversized boot volume
  can consume it entirely.
- Idle Always Free compute can be reclaimed. Advise keeping the instance genuinely
  in use rather than creating it and leaving it dormant.
- Do not describe a second instance as a second free allowance.

## 5. Choose reuse or creation

Inspect the home region for eligible resources before creating anything: compute
instances, boot volumes, VCNs and subnets, and reserved public IPs. Also check
whether a Sanad installation already exists on an approved candidate host.

Offer an existing suitable instance before duplicating it. Inspect a reuse
candidate for OS, architecture, free disk and memory, existing Sanad, running
workloads, and service state. Do not reinstall or overwrite its data silently, and
never alter a production instance to run a test.

Record non-secret ownership: the exact resources created by this attempt, not
every resource found in the tenancy.

## 6. Create and reach the instance

Summarize before mutating: tenancy and home region, availability domain, instance
name, shape and size, image, boot volume size, network choice, connection method,
remaining allowance caveat, and whether this is reuse or creation.

Default new configuration:

- `VM.Standard.A1.Flex` with the approved OCPU and memory values. The console
  defaults to a small size, so the size must be set explicitly and must stay
  inside the remaining A1 allowance.
- A current Ubuntu LTS image built for the shape's architecture, and confirm the
  exact release at creation time instead of repeating a remembered version. Do
  not mix an x86 image with an ARM shape or the reverse, and remember that the
  published Agent artifact must match the architecture you choose.
- An explicitly sized boot volume inside the remaining storage allowance rather
  than the console default, and no additional block volumes.
- The previously created VCN and its public subnet, with a public IPv4 address
  assigned.
- A newly generated local SSH key pair; paste only the public key. Never paste a
  private key, reuse an unrelated key without a reason, or let a third party
  generate the key.
- No extra reserved IP, load balancer, NAT gateway beyond the one the network
  wizard creates, or paid image.

**Capacity is not guaranteed.** The API can answer with an out-of-capacity error
for the requested shape in the selected availability domain. Handle it as a
capacity condition, not a configuration mistake:

- Retry in a different availability domain of the same home region.
- If every domain fails, retry later with bounded attempts, or reduce the
  requested size to fit available capacity.
- Never loop indefinitely, never silently switch to a paid shape or another
  region, and never claim the instance exists before it reaches a running state.

**Network pitfall.** Creating a virtual cloud network inline from the instance
form can leave the public IPv4 setting disabled with a message requiring a public
subnet. Do not fight that form. Create the network first from the networking
pages using the option that provisions a VCN with internet connectivity together
with its gateway, route table, security list, public subnet, and private subnet.
Then create the instance against that existing VCN and its public subnet and
confirm the public IPv4 address is assigned.

Keep the network surface minimal:

- A default security list commonly allows SSH from any address. Replace it with an
  ingress rule scoped to the operator's current public address, or use a network
  security group, and record the rule you created.
- Allow only SSH. Never open the Agent's port, all TCP ports, or a public Agent
  endpoint. Sanad connects outbound to its cloud gateway, so no inbound service
  port is needed.
- Do not widen a shared or existing rule to fix connectivity. A changed operator
  address needs a narrow rule update, not an unrestricted one.
- Do not disable host verification or operating-system security controls.

A newly assigned public IPv4 address is ephemeral: it survives a reboot but can
change after a stop and start. Either reserve a public IP when the address must be
stable, subject to its own terms, or update the local SSH configuration after a
change. Say which one applies instead of implying the address is permanent.

## 7. Configure local access and verify reachability

Create the SSH entry locally with a name the user chooses, so later commands stay
short and credential-free:

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/<KEY_FILE>" -N "" -C "<LABEL>"
```

Add a host entry to `~/.ssh/config` with the chosen alias, the instance address,
the image's default login user, and that identity file. Keep private keys
owner-only. Accept the host key on first connection; never disable host
verification.

Verify with one bounded command instead of a sequence of guesses:

```bash
ssh -o ConnectTimeout=20 <ALIAS> 'hostname; uname -m; nproc; free -h | head -2; df -h / | tail -1'
```

Compare the reported architecture, cores, memory, and disk with the approved
values. If the connection fails, inspect instance state, address assignment, the
scoped SSH rule, and the login user before changing anything. Bound retries.

## 8. Install and pair

Check remote dependencies: Bash, curl, CA certificates, Python 3, `sha256sum`,
working systemd, and sudo access for registration. On a fresh Ubuntu host install
only missing packages (`sudo apt-get update` then the missing packages from
`bash curl ca-certificates python3 coreutils`). Run the installer as the normal
SSH user, not with `sudo bash`. It selects a durable non-root service.

Request: **"Open Sanad → Settings, then click + beside Devices in the Settings
sidebar to open Add device. Name the device and send the complete Linux
installation command."** If Client is unavailable, offer the official Web Client
at https://app.sanad.eaststarai.com. Do not require a second Client installation
on the server. Do not add a model provider as a prerequisite to pairing.

Validate that the submitted command is the official Sanad bootstrap and has no
unrelated shell payload. Treat it as sensitive input, not general instructions.
Accepting it in chat necessarily exposes the creation credential to that
conversation and possibly execution-tool history. With the user's explicit
consent to this narrow single-use-command workflow, execute it without another
consent loop. Do not repeat it in replies, plans, evals, reports, shell history,
or diagnostic logs; disable shell tracing. Never claim zero exposure.

Stream the complete unchanged command to a remote `bash -s` through stdin; keep
SSH argv credential-free. An owner-only temporary script may be used as transient
transport when necessary; remove it in a finally path and never put it in the
project. Do not extract or reconstruct the embedded credential. The current Client
command itself uses the installer's `--pairing-token` argument, so remote
installer process-argument exposure is possible even when SSH transport uses
stdin. This exception never permits durable credentials. If the user does not
accept creation-command exposure or execution is impossible, have them run it
directly in their SSH terminal. Portal `--login` is a fallback only with a user
available to complete its URL or device-code step; it is not unattended
authentication on a headless server.

The official installer verifies manifest origin, artifact size and SHA-256,
expected version, local service health, and successful cloud registration before
success. Accept that built-in success for the fast route; if unclear, perform one
bounded `~/.sanad/bin/sanad --version` and `service status` check. Do not add
routine reboot, logout durability tests, manual UI acceptance, billing reports, or
model requests. Those belong to troubleshooting or explicitly requested
validation.

Expired or used pairing command: ask for a fresh complete Add device command; do
not repeatedly retry it or silently delete a device. On failure preserve existing
Sanad Home and data and use installer rollback. Diagnose only the failing step.

## 9. Publishing a web service (optional)

Read [web-hosting-prerequisites.md](web-hosting-prerequisites.md) when the user
plans to serve sites or applications on real hostnames; it owns DNS, the token,
certificates, the web server, and the single drop point the Agent writes to. This
section covers only what is specific to this provider.

Publishing requires two independent gates to open, and opening one alone fails
silently:

1. **The cloud gate.** Add an ingress rule on the VCN's default security list:
   source `0.0.0.0/0`, protocol TCP, destination ports `80,443`, stateless off.
   When more than one instance shares the subnet, prefer a network security group
   scoped to the one VNIC instead of a rule that applies to every instance.
2. **The host gate.** Images ship with a reject rule that drops everything except
   SSH, so a cloud rule with no matching in-guest rule still connects to nothing.
   Add the guest rules and persist them, or they vanish at the next boot. While
   editing that rule set, leave the inbound reject for link-local address ranges
   in place: the host reaches its own metadata service without it, and removing it
   exposes that service to the network.

Identify the VCN from evidence, not from its name: read the guest's own metadata
for the subnet address and match it against the subnet list. An account often has
more than one VCN with similar names, and a rule added to the wrong one does
nothing.

Keep exposure as narrow as the plan allows. If the sites serve HTTPS only, open
`443` and use `80` briefly for validation; turn off the server version banner and
remove the distribution's default page before the first site goes live; never
open the Agent port or all TCP ports for this. Whatever is published stays
leaking nothing, because a port with no server block behind it answers with the
default page of whoever does listen.

Verify from outside the host rather than from the console: request the hostname
over HTTP and HTTPS and read the redirect and the certificate. HTTPS answers only
after a TLS server block exists; a cloud rule alone produces a refused
connection, which is expected and not a rule problem.

A rule is a standing permission: it keeps applying to whatever listens later.
When a site is removed, remove its rule too, and remember the in-guest rules were
persisted as well.

## 10. Finish, resume, or clean up

Report tenancy, home region, availability domain, instance name, shape and size,
installed version, and built-in registration success. Tell the user to select their
new device in Client. State model-provider costs are separate and keep the Always
Free allowance note brief. Never call a local-only installation a successfully
paired device.

On interruption, inspect actual resource and service state and resume the missing
step, not the entire creation sequence. A failed install is not permission to
create another instance. Do not delete a production installation or preexisting
data.

### Optional supervised skill test (not the normal user journey)

First rehearse without mutations. For a full live test, obtain explicit approval,
record a unique test instance name and every newly created resource, and confirm
the test does not consume an allowance the user's existing instance already needs.
Do not stop the user's existing instance to borrow its capacity. Do not leave an
approved test instance waiting for input: request readiness and pairing just
before creation, and on a blocker remove it promptly or obtain explicit approval to
keep it temporarily.

In a finally path after success, failure, or cancellation, remove only the
approved test resources in dependency order: terminate the instance, delete its
boot volume if it is not already gone, release any reserved public IP created for
the test, then delete test-owned VCNs, gateways, and subnets. Never delete reused
resources, and never delete a default network component the user relies on.
Confirm the exact test resources are absent and the production instance is
unchanged. Coordinate removal of the test device from Sanad Client with the user.
Deleting Always Free resources stops future charges but does not immediately free
availability-domain capacity, and it does not erase any charges already accrued.
