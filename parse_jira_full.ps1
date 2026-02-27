$data = Get-Content "C:/tmp/jira_issues.json" | ConvertFrom-Json
$target = @("ISC-53","ISC-75","ISC-74","ISC-73","ISC-71","ISC-70","ISC-69","ISC-67","ISC-56","ISC-55","ISC-52","ISC-48","ISC-42")
foreach ($issue in $data.issues) {
    if ($target -contains $issue.key) {
        $f = $issue.fields
        $updated = if ($f.updated) { ([string]$f.updated).Substring(0, 19) } else { "N/A" }
        $created = if ($f.created) { ([string]$f.created).Substring(0, 19) } else { "N/A" }
        $assigneeName = if ($f.assignee) { $f.assignee.displayName } else { "Unassigned" }
        $reporter = if ($f.reporter) { $f.reporter.displayName } else { "N/A" }
        Write-Host ("=== " + $issue.key + " ===")
        Write-Host ("Summary: " + $f.summary)
        Write-Host ("Status: " + $f.status.name)
        Write-Host ("Priority: " + $f.priority.name)
        Write-Host ("Type: " + $f.issuetype.name)
        Write-Host ("Updated: " + $updated)
        Write-Host ("Created: " + $created)
        Write-Host ("Due Date: " + $f.duedate)
        Write-Host ("Assignee: " + $assigneeName)
        Write-Host ("Reporter: " + $reporter)
        Write-Host ""
    }
}
