$data = Get-Content "C:/tmp/jira_issues.json" | ConvertFrom-Json
Write-Host ("Total issues found: " + $data.total)
Write-Host ("Issues returned: " + $data.issues.Count)
Write-Host ""
foreach ($i in $data.issues) {
    $f = $i.fields
    $updated = if ($f.updated) { ([string]$f.updated).Substring(0, 10) } else { "N/A" }
    $created = if ($f.created) { ([string]$f.created).Substring(0, 10) } else { "N/A" }
    $status = if ($f.status) { $f.status.name } else { "N/A" }
    $priority = if ($f.priority) { $f.priority.name } else { "N/A" }
    $itype = if ($f.issuetype) { $f.issuetype.name } else { "N/A" }
    Write-Host ("Key:      " + $i.key)
    Write-Host ("Summary:  " + $f.summary)
    Write-Host ("Status:   " + $status)
    Write-Host ("Priority: " + $priority)
    Write-Host ("Type:     " + $itype)
    Write-Host ("Updated:  " + $updated)
    Write-Host ("Created:  " + $created)
    Write-Host ""
}
