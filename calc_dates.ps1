$today = [DateTime]'2026-02-21'

$tickets = @(
    [PSCustomObject]@{ Key='ISC-53'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-02-18'; DueDate=[DateTime]'2026-01-30' },
    [PSCustomObject]@{ Key='ISC-75'; Created=[DateTime]'2026-02-14'; Updated=[DateTime]'2026-02-17'; DueDate=[DateTime]'2026-02-20' },
    [PSCustomObject]@{ Key='ISC-74'; Created=[DateTime]'2026-02-14'; Updated=[DateTime]'2026-02-14'; DueDate=[DateTime]'2026-02-17' },
    [PSCustomObject]@{ Key='ISC-73'; Created=[DateTime]'2026-02-14'; Updated=[DateTime]'2026-02-14'; DueDate=[DateTime]'2026-02-20' },
    [PSCustomObject]@{ Key='ISC-71'; Created=[DateTime]'2025-12-08'; Updated=[DateTime]'2026-02-08'; DueDate=[DateTime]'2025-12-15' },
    [PSCustomObject]@{ Key='ISC-70'; Created=[DateTime]'2025-11-21'; Updated=[DateTime]'2026-02-08'; DueDate=[DateTime]'2025-12-05' },
    [PSCustomObject]@{ Key='ISC-69'; Created=[DateTime]'2025-10-13'; Updated=[DateTime]'2026-02-08'; DueDate=$null },
    [PSCustomObject]@{ Key='ISC-67'; Created=[DateTime]'2025-11-17'; Updated=[DateTime]'2026-02-08'; DueDate=$null },
    [PSCustomObject]@{ Key='ISC-56'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-01-26'; DueDate=[DateTime]'2026-01-23' },
    [PSCustomObject]@{ Key='ISC-55'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-01-23'; DueDate=[DateTime]'2026-01-22' },
    [PSCustomObject]@{ Key='ISC-52'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-01-21'; DueDate=[DateTime]'2026-01-23' },
    [PSCustomObject]@{ Key='ISC-48'; Created=[DateTime]'2026-01-12'; Updated=[DateTime]'2026-01-14'; DueDate=[DateTime]'2026-01-16' },
    [PSCustomObject]@{ Key='ISC-42'; Created=[DateTime]'2026-01-05'; Updated=[DateTime]'2026-01-27'; DueDate=[DateTime]'2026-12-31' }
)

foreach ($t in $tickets) {
    $daysOpen = ($today - $t.Created).Days
    $daysSinceUpdate = ($today - $t.Updated).Days
    if ($t.DueDate) {
        $daysPastDue = ($today - $t.DueDate).Days
        $dueDateStr = $t.DueDate.ToString("yyyy-MM-dd")
    } else {
        $daysPastDue = -999
        $dueDateStr = "No due date"
    }
    Write-Host ($t.Key + " | DaysOpen:" + $daysOpen + " | DaysSinceUpdate:" + $daysSinceUpdate + " | DaysPastDue:" + $daysPastDue + " | DueDate:" + $dueDateStr)
}
