$data = Get-Content "C:/tmp/jira_issues.json" | ConvertFrom-Json
$target = @("ISC-53","ISC-75","ISC-74","ISC-73","ISC-71","ISC-70","ISC-69","ISC-67","ISC-56","ISC-55","ISC-52","ISC-48","ISC-42")
foreach ($issue in $data.issues) {
    if ($target -contains $issue.key) {
        $f = $issue.fields
        Write-Host ("=== " + $issue.key + " ===")
        Write-Host ("Summary: " + $f.summary)
        Write-Host ("Status: " + $f.status.name)
        Write-Host ("Priority: " + $f.priority.name)
        Write-Host ("Type: " + $f.issuetype.name)
        $updated = if ($f.updated) { ([string]$f.updated).Substring(0, 10) } else { "N/A" }
        $created = if ($f.created) { ([string]$f.created).Substring(0, 10) } else { "N/A" }
        Write-Host ("Updated: " + $updated)
        Write-Host ("Created: " + $created)
        Write-Host ("Due Date: " + $f.duedate)

        # Check for comments
        $comments = $f.comment
        if ($comments -and $comments.comments -and $comments.comments.Count -gt 0) {
            $lastComment = $comments.comments[$comments.comments.Count - 1]
            $commentDate = if ($lastComment.created) { ([string]$lastComment.created).Substring(0, 10) } else { "N/A" }
            $commentAuthor = if ($lastComment.author) { $lastComment.author.displayName } else { "N/A" }
            Write-Host ("Last Comment Date: " + $commentDate)
            Write-Host ("Last Comment Author: " + $commentAuthor)
            # Get text from comment body
            $bodyText = if ($lastComment.body -and $lastComment.body.content) {
                $textParts = @()
                foreach ($block in $lastComment.body.content) {
                    foreach ($inline in $block.content) {
                        if ($inline.type -eq "text") { $textParts += $inline.text }
                    }
                }
                ($textParts -join " ").Substring(0, [Math]::Min(300, ($textParts -join " ").Length))
            } else { "N/A" }
            Write-Host ("Last Comment: " + $bodyText)
        } else {
            Write-Host "Last Comment: None"
        }

        # Check for blockers/linked issues
        $links = $f.issuelinks
        if ($links -and $links.Count -gt 0) {
            Write-Host ("Linked Issues: " + $links.Count)
            foreach ($link in $links) {
                Write-Host ("  - " + $link.type.name + ": " + ($link.inwardIssue.key + " " + $link.outwardIssue.key))
            }
        } else {
            Write-Host "Linked Issues: None"
        }

        Write-Host ""
    }
}
