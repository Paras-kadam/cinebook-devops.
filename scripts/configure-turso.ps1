Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$repoDirectory = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $repoDirectory '.env.production.local'
if (!(Test-Path -LiteralPath $configFile -PathType Leaf)) {
    [System.Windows.Forms.MessageBox]::Show('The existing .env.production.local file was not found. Return to the deployment chat.', 'CineBook setup') | Out-Null
    exit 1
}
$form = New-Object System.Windows.Forms.Form
$form.Text = 'CineBook - private Turso connection'
$form.ClientSize = New-Object System.Drawing.Size(590, 290)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$intro = New-Object System.Windows.Forms.Label
$intro.Text = 'Copy the values from Turso > your libSQL database > Connect. This window saves them only in your private CineBook configuration file.'
$intro.Location = New-Object System.Drawing.Point(20, 16)
$intro.Size = New-Object System.Drawing.Size(550, 44)
$form.Controls.Add($intro)
$urlLabel = New-Object System.Windows.Forms.Label
$urlLabel.Text = 'Database URL (starts with libsql:// or https://)'
$urlLabel.Location = New-Object System.Drawing.Point(20, 70)
$urlLabel.Size = New-Object System.Drawing.Size(550, 20)
$form.Controls.Add($urlLabel)
$urlField = New-Object System.Windows.Forms.TextBox
$urlField.Location = New-Object System.Drawing.Point(20, 94)
$urlField.Size = New-Object System.Drawing.Size(550, 24)
$form.Controls.Add($urlField)
$tokenLabel = New-Object System.Windows.Forms.Label
$tokenLabel.Text = 'Read/write database authentication token (masked)'
$tokenLabel.Location = New-Object System.Drawing.Point(20, 132)
$tokenLabel.Size = New-Object System.Drawing.Size(550, 20)
$form.Controls.Add($tokenLabel)
$tokenField = New-Object System.Windows.Forms.TextBox
$tokenField.Location = New-Object System.Drawing.Point(20, 156)
$tokenField.Size = New-Object System.Drawing.Size(550, 24)
$tokenField.UseSystemPasswordChar = $true
$form.Controls.Add($tokenField)
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = 'Paste values only, without variable names or JavaScript code.'
$statusLabel.Location = New-Object System.Drawing.Point(20, 196)
$statusLabel.Size = New-Object System.Drawing.Size(550, 32)
$form.Controls.Add($statusLabel)
$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Text = 'Save private settings'
$saveButton.Location = New-Object System.Drawing.Point(370, 238)
$saveButton.Size = New-Object System.Drawing.Size(200, 32)
$saveButton.Add_Click({
    $databaseUrl = $urlField.Text.Trim()
    $databaseToken = $tokenField.Text.Trim()
    $parsedUrl = $null
    if (![Uri]::TryCreate($databaseUrl, [UriKind]::Absolute, [ref]$parsedUrl) -or
        $parsedUrl.Scheme -notin @('libsql', 'https') -or !$parsedUrl.Host -or
        $parsedUrl.UserInfo -or $parsedUrl.Query -or $parsedUrl.Fragment -or
        $databaseUrl -match '\s') {
        $statusLabel.Text = 'Paste only the libsql:// database URL from Connect.'
        return
    }
    if ($databaseToken.Length -lt 20 -or $databaseToken -notmatch '^[A-Za-z0-9._-]+$') {
        $statusLabel.Text = 'Paste only the full database token from Connect, without quotes.'
        return
    }
    try {
        $settings = [System.Collections.Generic.List[string]]::new()
        foreach ($line in [IO.File]::ReadAllLines($configFile)) {
            if ($line -notmatch '^\s*(?:export\s+)?(?:TURSO_DATABASE_URL|TURSO_AUTH_TOKEN)\s*=') {
                $settings.Add($line)
            }
        }
        $settings.Add('TURSO_DATABASE_URL=' + $databaseUrl)
        $settings.Add('TURSO_AUTH_TOKEN=' + $databaseToken)
        [IO.File]::WriteAllLines($configFile, $settings, [Text.UTF8Encoding]::new($false))
        $tokenField.Clear()
        [System.Windows.Forms.MessageBox]::Show('Both Turso fields were saved in the correct private file. Return to the deployment chat for the connection check.', 'CineBook: saved') | Out-Null
        $form.Close()
    } catch {
        $statusLabel.Text = 'The private file could not be saved. Return to the deployment chat.'
    }
})
$form.Controls.Add($saveButton)
$form.AcceptButton = $saveButton
[void]$form.ShowDialog()
$form.Dispose()
