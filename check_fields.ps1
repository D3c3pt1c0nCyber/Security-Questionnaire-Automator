$data = Get-Content "C:/tmp/jira_issues.json" | ConvertFrom-Json
# Check what fields are in ISC-53
foreach ($issue in $data.issues) {
    if ($issue.key -eq "ISC-53") {
        $f = $issue.fields
        Write-Host "Available fields for ISC-53:"
        $f.PSObject.Properties | ForEach-Object { Write-Host ("  " + $_.Name + ": " + ($_.Value | ConvertTo-Json -Depth 1 -Compress 2>$null)) }
        break
    }
}
