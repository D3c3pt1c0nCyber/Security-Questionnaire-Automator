$data = Get-Content "C:/tmp/jira_issues.json" | ConvertFrom-Json
Write-Host ("Total issues found: " + $data.total)
Write-Host ("Issues returned: " + $data.issues.Count)
Write-Host ""
foreach ($i in $data.issues) {
    $f = $i.fields
    Write-Host ("Key:      " + $i.key)
    Write-Host ("Summary:  " + $f.summary)
    Write-Host ("Status:   " + $f.status.name)
    Write-Host ("Priority: " + $f.priority.name)
    Write-Host ("Type:     " + $f.issuetype.name)
    Write-Host ("Updated:  " + $f.updated.Substring(0, 10))
    Write-Host ("Created:  " + $f.created.Substring(0, 10))
    Write-Host ""
}
