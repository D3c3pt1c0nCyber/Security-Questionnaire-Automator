$data = Get-Content "C:/tmp/jira_issues.json" | ConvertFrom-Json
Write-Host ("Total issues in file: " + $data.issues.Count)
Write-Host "All keys in file:"
foreach ($issue in $data.issues) {
    Write-Host ("  " + $issue.key + " | Status: " + $issue.fields.status.name + " | Updated: " + ([string]$issue.fields.updated).Substring(0,10))
}
