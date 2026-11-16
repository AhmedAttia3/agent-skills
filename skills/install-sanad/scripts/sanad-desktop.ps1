# Sanad desktop helper for Windows: open, start, stop, or inspect the browser
# desktop that runs on a remote host. The desktop listens on the remote loopback;
# this script only manages an SSH tunnel from this machine to it.
#
# STATUS: UNTESTED. This file was written against Windows OpenSSH and PowerShell
# 5.1+ documentation but has never been executed on a Windows host. Verify the
# four actions and the tunnel-detection path on a real Windows machine, fix what
# breaks, and replace this note with the verified behaviour before relying on it.
# The macOS/Linux counterpart, sanad-desktop.sh, is tested.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File sanad-desktop.ps1 <action> <ssh-alias>
#
#   open    ensure the remote desktop and the tunnel are up, then open the browser
#   start   start the remote desktop and the tunnel, without opening the browser
#   stop    stop the tunnel and the remote desktop
#   status  report tunnel, remote unit state, and the URL to open
#
# Environment overrides:
#   SANAD_DESKTOP_PORT   default 6081
#   SANAD_DESKTOP_UNIT   default sanad-kasmvnc.service
#   SANAD_DESKTOP_USER   remote user, when it differs from the ssh default

param(
    [Parameter(Position = 0)]
    [ValidateSet('open', 'start', 'stop', 'status')]
    [string]$Action = 'open',

    [Parameter(Position = 1)]
    [string]$Alias = $env:SANAD_DESKTOP_ALIAS
)

$ErrorActionPreference = 'Stop'

$Port = if ($env:SANAD_DESKTOP_PORT) { $env:SANAD_DESKTOP_PORT } else { '6081' }
$Unit = if ($env:SANAD_DESKTOP_UNIT) { $env:SANAD_DESKTOP_UNIT } else { 'sanad-kasmvnc.service' }
$Target = if ($env:SANAD_DESKTOP_USER) { "$($env:SANAD_DESKTOP_USER)@$Alias" } else { $Alias }
$Url = "http://localhost:$Port/"

function Fail([string]$Message) {
    Write-Error "error: $Message"
    exit 1
}

if (-not $Alias) {
    Fail "missing ssh alias (usage: sanad-desktop.ps1 {open|start|stop|status} <ssh-alias>)"
}

function Invoke-Remote([string]$Command) {
    # BatchMode keeps an unattended path from hanging on a prompt.
    $output = & ssh -o BatchMode=yes -o ConnectTimeout=15 $Target $Command 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = $output }
}

function Test-RemoteRunning {
    $result = Invoke-Remote "systemctl is-active --quiet $Unit"
    return $result.ExitCode -eq 0
}

function Get-TunnelPid {
    try {
        $listener = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction Stop |
            Select-Object -First 1
        return $listener.OwningProcess
    } catch {
        return $null
    }
}

function Test-PortResponds {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $true
    } catch {
        # 401 means the bridge is up and asking for the desktop password.
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { return $true }
        return $false
    }
}

function Start-Remote {
    if (Test-RemoteRunning) { return }
    Write-Host "starting $Unit on $Alias ..."
    $result = Invoke-Remote "sudo systemctl start $Unit"
    if ($result.ExitCode -ne 0) { Fail "could not start $Unit on $Alias" }
}

function Start-Tunnel {
    if (Get-TunnelPid) {
        Write-Host "tunnel already up on port $Port"
        return
    }
    Write-Host "opening tunnel $Port -> ${Alias}:$Port ..."
    # Windows OpenSSH has no -f, so the tunnel runs as a background process.
    $arguments = @(
        '-N',
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=30',
        '-L', "$Port`:127.0.0.1:$Port",
        $Alias
    )
    Start-Process -FilePath 'ssh' -ArgumentList $arguments -WindowStyle Hidden | Out-Null

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        if (Test-PortResponds) { return }
    }
    Fail "tunnel opened but port $Port does not answer yet"
}

switch ($Action) {
    'open' {
        Start-Remote
        Start-Tunnel
        Write-Host "desktop ready: $Url"
        Start-Process $Url
    }
    'start' {
        Start-Remote
        Start-Tunnel
        Write-Host "desktop ready: $Url"
    }
    'stop' {
        $tunnelPid = Get-TunnelPid
        if ($tunnelPid) {
            Stop-Process -Id $tunnelPid -Force
            Write-Host 'tunnel closed'
        } else {
            Write-Host "no tunnel on port $Port"
        }
        if (Test-RemoteRunning) {
            $result = Invoke-Remote "sudo systemctl stop $Unit"
            if ($result.ExitCode -ne 0) { Fail "could not stop $Unit on $Alias" }
            Write-Host "desktop stopped on $Alias"
        } else {
            Write-Host "desktop already stopped on $Alias"
        }
    }
    'status' {
        $state = if (Test-RemoteRunning) { 'running' } else { 'stopped' }
        $tunnel = if (Get-TunnelPid) { 'up' } else { 'down' }
        Write-Host "remote desktop : $state ($Unit)"
        Write-Host "tunnel         : $tunnel"
        Write-Host "url            : $Url"
    }
}
