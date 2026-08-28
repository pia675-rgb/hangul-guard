# English Guard local server — binds 127.0.0.1 only (this PC).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Find-Port {
  param([int]$Start)
  for ($p = $Start; $p -lt $Start + 20; $p++) {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
    try {
      $listener.Start()
      $listener.Stop()
      return $p
    } catch {
      continue
    }
  }
  throw "No free port"
}

$port = Find-Port -Start 8765
$prefix = "http://127.0.0.1:$port/"
$http = [System.Net.HttpListener]::new()
$http.Prefixes.Add($prefix)
$http.Start()

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".ico"  = "image/x-icon"
  ".map"  = "application/json"
  ".txt"  = "text/plain; charset=utf-8"
  ".woff" = "font/woff"
  ".woff2"= "font/woff2"
}

Write-Host ""
Write-Host "  English Guard  (local)"
Write-Host "  $prefix"
Write-Host "  Files stay on this PC. Close this window to stop."
Write-Host ""

Start-Process $prefix

while ($http.IsListening) {
  $ctx = $http.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
  $full = [IO.Path]::GetFullPath((Join-Path $root ($rel -replace "/", [IO.Path]::DirectorySeparatorChar)))
  $rootFull = [IO.Path]::GetFullPath($root)
  if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    $ctx.Response.StatusCode = 403
    $ctx.Response.Close()
    continue
  }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
    $ctx.Response.StatusCode = 404
    $bytes = [Text.Encoding]::UTF8.GetBytes("Not found")
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
    continue
  }
  $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
  $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" })
  $data = [IO.File]::ReadAllBytes($full)
  $ctx.Response.ContentLength64 = $data.Length
  $ctx.Response.OutputStream.Write($data, 0, $data.Length)
  $ctx.Response.Close()
}
