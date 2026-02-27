$tickets = @("ISC-53","ISC-75","ISC-74","ISC-73","ISC-71","ISC-70","ISC-69","ISC-67","ISC-56","ISC-55","ISC-52","ISC-48","ISC-42")

foreach ($key in $tickets) {
    $jsonPath = "C:/Users/joie.sayen/AppData/Local/Temp/${key}.json"
    if (-not (Test-Path $jsonPath)) {
        # Try /tmp path via WSL
        $jsonPath = "/tmp/${key}.json"
    }

    # Read from bash /tmp which maps to different Windows path
    $bashTmp = "C:/Users/joie.sayen/AppData/Local/Temp/${key}.json"

    # The /tmp in git bash is usually C:/Users/CURRENT_USER/AppData/Local/Temp/
    # Let's try various paths
    $paths = @(
        "C:/Users/joie.sayen/AppData/Local/Temp/${key}.json",
        "C:/tmp/${key}.json",
        "/tmp/${key}.json"
    )

    $data = $null
    foreach ($p in $paths) {
        if (Test-Path $p) {
            try {
                $data = Get-Content $p | ConvertFrom-Json
                break
            } catch { }
        }
    }

    if ($null -eq $data) {
        Write-Host ("=== ${key} === NOT FOUND")
        continue
    }

    $f = $data.fields
    $updated = if ($f.updated) { ([string]$f.updated).Substring(0, 10) } else { "N/A" }
    $created = if ($f.created) { ([string]$f.created).Substring(0, 10) } else { "N/A" }
    $assigneeName = if ($f.assignee) { $f.assignee.displayName } else { "Unassigned" }
    $dueDate = if ($f.duedate) { $f.duedate } else { "No due date" }

    Write-Host ("=== " + $data.key + " ===")
    Write-Host ("Summary: " + $f.summary)
    Write-Host ("Status: " + $f.status.name)
    Write-Host ("Priority: " + $f.priority.name)
    Write-Host ("Type: " + $f.issuetype.name)
    Write-Host ("Created: " + $created)
    Write-Host ("Updated: " + $updated)
    Write-Host ("Due Date: " + $dueDate)
    Write-Host ("Assignee: " + $assigneeName)

    # Description
    $descText = "None"
    if ($f.description -and $f.description.content) {
        $parts = @()
        foreach ($block in $f.description.content) {
            if ($block.content) {
                foreach ($inline in $block.content) {
                    if ($inline.type -eq "text" -and $inline.text) {
                        $parts += $inline.text
                    }
                }
            }
        }
        $joined = ($parts -join " ").Trim()
        if ($joined.Length -gt 400) { $joined = $joined.Substring(0, 400) + "..." }
        if ($joined) { $descText = $joined }
    }
    Write-Host ("Description: " + $descText)

    # Comments
    if ($f.comment -and $f.comment.comments -and $f.comment.comments.Count -gt 0) {
        $lastComment = $f.comment.comments[$f.comment.comments.Count - 1]
        $commentDate = if ($lastComment.created) { ([string]$lastComment.created).Substring(0, 10) } else { "N/A" }
        $commentAuthor = if ($lastComment.author) { $lastComment.author.displayName } else { "N/A" }
        Write-Host ("Last Comment Date: " + $commentDate)
        Write-Host ("Last Comment Author: " + $commentAuthor)

        $commentText = "N/A"
        if ($lastComment.body -and $lastComment.body.content) {
            $cparts = @()
            foreach ($block in $lastComment.body.content) {
                if ($block.content) {
                    foreach ($inline in $block.content) {
                        if ($inline.type -eq "text" -and $inline.text) {
                            $cparts += $inline.text
                        }
                    }
                }
            }
            $cjoined = ($cparts -join " ").Trim()
            if ($cjoined.Length -gt 300) { $cjoined = $cjoined.Substring(0, 300) + "..." }
            if ($cjoined) { $commentText = $cjoined }
        }
        Write-Host ("Last Comment: " + $commentText)
        Write-Host ("Total Comments: " + $f.comment.total)
    } else {
        Write-Host "Last Comment: None"
        Write-Host "Total Comments: 0"
    }

    # Linked issues / blockers
    if ($f.issuelinks -and $f.issuelinks.Count -gt 0) {
        Write-Host ("Linked Issues: " + $f.issuelinks.Count)
        foreach ($link in $f.issuelinks) {
            $linkType = $link.type.name
            $linkedKey = if ($link.inwardIssue) { $link.inwardIssue.key + " (" + $link.inwardIssue.fields.status.name + ")" } elseif ($link.outwardIssue) { $link.outwardIssue.key + " (" + $link.outwardIssue.fields.status.name + ")" } else { "unknown" }
            Write-Host ("  - " + $linkType + ": " + $linkedKey)
        }
    } else {
        Write-Host "Linked Issues: None"
    }

    Write-Host ""
}
