# Browser Desktop for a Remote Sanad Host

Use this route when the user wants a graphical desktop on a remote host they
already reach over SSH, controlled from a browser. Keep Client and its interface
on the user's own machine: this desktop is for administering the host, not for
running the Client.

KasmVNC is the recommended server. It serves the web client and the remote
framebuffer from one process, negotiates a modern image encoding per update
instead of a fixed RFB one, and keeps the clipboard working in both directions.
The older stack of a plain VNC server plus a separate websocket bridge needs two
processes, transfers more data for the same content, and cannot paste text from
the local machine into the remote one reliably on every path.

## 1. Ask little; inspect first

Skip questions already answered. Two questions are usually enough:

1. **Purpose:** administer an existing host, or work inside graphical
   applications on it? Administration is the common case and needs the lightest
   setup. Working inside browsers, editors, or build tools is heavier and belongs
   on a host with spare memory.
2. **Host state:** first desktop on this host, or does a display server or a
   desktop environment already exist? If inspection answers it, name what you
   found for confirmation instead of asking.

State one limit up front so expectations are honest: there is no GPU and no
audio path over the browser, so video, animation, and sound are not part of the
deal. Closing it later is cheap and reversible, which is why the default keeps
it off until asked for.

## 2. Security model

The desktop must never be reachable from the internet. Three rules carry the
whole model:

- Bind the server and its web bridge to the loopback interface only. The remote
  firewall stays unchanged, so no cloud security rule or port needs opening.
- Reach it through an SSH tunnel from the operator's machine. SSH key
  authentication is the real access control; the desktop password is a second,
  weaker layer.
- Generate the desktop password locally at random; never ship a default, reuse a
  documented value, or store a password in this skill or in a transcript. Keep
  the password file owner-only on the host and, when the operator needs it on
  their own machine, place it in a private local file rather than in chat.

Before installing, check the host answers on SSH and note the account and key
that work, because the service will run as that account. Do not open, widen, or
disable any remote firewall rule to reach the desktop: that converts a
loopback-only service into a public attack surface.

## 3. Size the host before installing

Measure free memory and disk, then compare with the expected cost: a desktop
environment plus the VNC server idles at a few hundred megabytes of memory and
takes several hundred megabytes of disk, and both grow while the desktop is in
use. On a small host, say so before installing, and prefer a minimal desktop
package set with recommended packages turned off.

Container and image sizes differ per distribution, so read the actual numbers
from the host rather than repeating remembered ones. Do not describe a
graphical desktop as free of cost on a host whose memory is already committed to
production services; it competes with them.

## 4. Install the server

Install KasmVNC from its official release package for the host's distribution
and architecture. Its packages name the architecture explicitly, so confirm the
file you download matches the host instead of assuming the default:

```bash
dpkg -i kasmvncserver_<distro>_<version>_<arch>.deb
```

On ARM hosts the architecture suffix is `arm64`; picking the wrong one installs
cleanly and then fails at run time. If the host has no certificate package, the
server refuses to start until one exists, because it validates its certificate
files even when TLS is disabled. Install the distribution's certificate package
or generate a local self-signed pair owned by the service account.

Video encoding support is a separate library. Without it the server logs a
missing library and falls back to still-image encoding, which is usable but
slower. Install the distribution's `libavformat` package when the host has it;
hardware-accelerated encoding stays unavailable on hosts without a GPU, which is
expected and is not a failure.

## 5. Configure a loopback-only service

Write the server configuration for the service account, not for root, and keep
three decisions explicit:

- **Interface:** loopback only.
- **Web port:** set it explicitly. When it is left automatic the server picks an
  unrelated port, and a tunnel to a remembered port silently connects to
  nothing.
- **TLS:** not required behind an SSH tunnel, since the tunnel already encrypts
  the traffic. The certificate files must still exist and be readable by the
  service account.

A user with write access is mandatory. KasmVNC refuses to start without one and
exits with a message telling you to add a user, so create it non-interactively
from a locally generated password before the first start. Then start the desktop
session from the same session file a normal X server uses, launching the desktop
environment through the session bus so panels, settings, and notifications work.

Run the desktop as a system service under the host account, so it survives the
SSH session that started it:

```bash
systemctl is-active <desktop-unit>
systemctl start <desktop-unit>
systemctl stop <desktop-unit>
```

Leave the unit disabled at boot by default. A desktop nobody is watching holds
memory on a host that is otherwise serving production work; starting it when
needed costs one command. Enable it at boot only when the user says they use it
constantly, and say plainly that it will then stay resident.

## 6. Reach it from the operator's machine

Forward the web port over SSH, then open it locally:

```bash
ssh -f -N -L <PORT>:127.0.0.1:<PORT> <SSH_ALIAS>
```

The desktop is then at `http://localhost:<PORT>/`. The browser asks once for the
desktop user and password; the credential is sent only inside the tunnel.

Provide the operator with one entry point instead of three commands. Bundle this
route's start, stop, status, and open behaviour in the bundled helper, whose
arguments and environment overrides cover the port, the unit name, and the SSH
alias:

```bash
<scripts>/sanad-desktop.sh open <SSH_ALIAS>
<scripts>/sanad-desktop.sh stop <SSH_ALIAS>
```

The helper reuses an existing tunnel instead of stacking a second one, and it
refuses to continue when the port is already taken. Treat a busy port as a
conflict to resolve, never as permission to kill an unrelated process.

A PowerShell counterpart ships for Windows with the same actions. It is written
but has not been executed on a Windows host, so verify it before relying on it
and say so plainly when handing it over. Windows OpenSSH has no `-f`, which is
why the counterpart starts the tunnel as a background process instead of
detaching.

## 7. Verify isolation, control, and cost

Prove the properties instead of asserting them:

- The desktop and its web port listen on the loopback interface only on the
  host, and connecting from the internet to that port fails.
- Opening the local URL returns a page, and the session accepts the generated
  password while rejecting a wrong one.
- Dragging a window, typing in a text field, and opening an application inside
  the desktop all respond, which is the real proof of control.
- Copying text on the operator's machine pastes into the remote session and the
  reverse direction also works.
- Measure host memory before and after starting the desktop, and report the
  difference rather than an estimate.

Never weaken a firewall rule, disable host verification, or expose the port to
make a verification pass.

## 8. Operate, stop, and recover

Explain the lifecycle, because it is not obvious: closing the browser tab
disconnects the viewer and leaves the desktop session and everything running
inside it alive; reconnecting returns to the same session, not a new one. The
tunnel is separate again: it stays up until it is closed or the machine
reconnects to the network.

So stopping is deliberately two steps, and both should be named when reporting:
close the tunnel, and stop the desktop unit. Neither touches an installed Agent,
which runs as its own service and stays online.

After a host reboot, or after the operator's machine restarts, the tunnel is
gone and the desktop is down if the unit is disabled. Reconnecting is one
command, and that command belongs in the handover.

## 9. Troubleshoot the common failures

- **Page loads, desktop never appears.** The web socket did not connect. Check
  the web port value, that the bridge listens on loopback, and that the browser
  authenticated for the same origin.
- **Password rejected.** The user file was replaced or the session was started
  before the user existed. Recreate the user from a fresh random password and
  restart the unit.
- **Server exits immediately after install.** Usually a missing write-access
  user, a certificate file the service account cannot read, or a package built
  for another architecture. Read the service log, it names which one.
- **Blank or black screen after connecting.** The session file did not launch a
  desktop environment through the session bus. Fix the session file and restart
  the unit rather than reinstalling the server.
- **`Address already in use`.** A previous tunnel or the previous port binding
  is still held. Identify the owner and stop that, do not kill processes you
  cannot identify.
- **Sluggish graphics on a host without a GPU.** Expected: encoding is software
  only. Lower the resolution and desktop size before adding services or tuning
  anything else.

## 10. Finish, report, and clean up

Report the URL, the port, the desktop user, where the generated password was
placed, the unit name, whether it is enabled at boot, the measured memory cost,
and the single command that reopens it. State that the desktop is for host
administration and that no desktop audio or GPU acceleration is available.

For removal, stop the unit, delete the unit file, and purge the server package.
Do not remove a desktop environment, a display server, or a session file that
existed before this route ran, and do not remove other users' files under the
home directory.

### Optional supervised test (not the normal user journey)

First rehearse without installing. For a live test, confirm the host has spare
memory, create the service with a generated password, verify isolation and
control as in section 7, then remove exactly what this test created and confirm
the preexisting services on the host are unchanged. Record whether the desktop
was left running, since that memory stays allocated until it is stopped.
