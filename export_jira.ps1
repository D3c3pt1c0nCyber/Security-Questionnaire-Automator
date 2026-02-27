$today = [DateTime]'2026-02-21'
$baseUrl = 'https://lmsportal.atlassian.net/browse/'

$tickets = @(
    [PSCustomObject]@{ Key='ISC-53'; Summary='Advent Health (TS, Scheduling, Evals+ and CheckIT)'; Status='ASSIGNED'; Priority='P3'; IssueType='RFP'; Product='TargetSolutions, Scheduling, Evals+, CheckIT'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-02-18'; DueDate=[DateTime]'2026-01-30' },
    [PSCustomObject]@{ Key='ISC-75'; Summary='Anglo Gold Ashanti - Convergence'; Status='ASSIGNED'; Priority='P3'; IssueType='RFP'; Product='Convergence'; Created=[DateTime]'2026-02-14'; Updated=[DateTime]'2026-02-17'; DueDate=[DateTime]'2026-02-20' },
    [PSCustomObject]@{ Key='ISC-74'; Summary='Stony Brook University NY - Scheduling'; Status='ASSIGNED'; Priority='P3'; IssueType='RFP'; Product='Scheduling'; Created=[DateTime]'2026-02-14'; Updated=[DateTime]'2026-02-14'; DueDate=[DateTime]'2026-02-17' },
    [PSCustomObject]@{ Key='ISC-73'; Summary='City of Alexandria (VA) - TargetSolutions'; Status='ASSIGNED'; Priority='P3'; IssueType='RFP'; Product='TargetSolutions'; Created=[DateTime]'2026-02-14'; Updated=[DateTime]'2026-02-14'; DueDate=[DateTime]'2026-02-20' },
    [PSCustomObject]@{ Key='ISC-71'; Summary='University of North Texas Dallas - LiveSafe'; Status='ASSIGNED'; Priority='P3'; IssueType='RFP'; Product='LiveSafe'; Created=[DateTime]'2025-12-08'; Updated=[DateTime]'2026-02-08'; DueDate=[DateTime]'2025-12-15' },
    [PSCustomObject]@{ Key='ISC-70'; Summary='Hertz - EHS'; Status='In Progress'; Priority='P3'; IssueType='RFP'; Product='EHS'; Created=[DateTime]'2025-11-21'; Updated=[DateTime]'2026-02-08'; DueDate=[DateTime]'2025-12-05' },
    [PSCustomObject]@{ Key='ISC-69'; Summary='Complete HECVAT 4.1.2 for SafeLMS'; Status='Projects - In Progress'; Priority='P3'; IssueType='Task'; Product='SafeLMS'; Created=[DateTime]'2025-10-13'; Updated=[DateTime]'2026-02-08'; DueDate=$null },
    [PSCustomObject]@{ Key='ISC-67'; Summary='RFP Genie - Importing and Arranging Data'; Status='Time Tracking'; Priority='P3'; IssueType='Task'; Product='RFP Genie'; Created=[DateTime]'2025-11-17'; Updated=[DateTime]'2026-02-08'; DueDate=$null },
    [PSCustomObject]@{ Key='ISC-56'; Summary='Northwestern Mutual - Convergence (Follow up question)'; Status='In Progress'; Priority='P3'; IssueType='RFP'; Product='Convergence'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-01-26'; DueDate=[DateTime]'2026-01-23' },
    [PSCustomObject]@{ Key='ISC-55'; Summary='Jefferson County Schools - SafeLMS and EV+/PD (Follow-up)'; Status='In Progress'; Priority='P3'; IssueType='RFP'; Product='SafeLMS, EV+/PD'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-01-23'; DueDate=[DateTime]'2026-01-22' },
    [PSCustomObject]@{ Key='ISC-52'; Summary='Amp Americas - EHS'; Status='ASSIGNED'; Priority='P3'; IssueType='RFP'; Product='EHS'; Created=[DateTime]'2026-01-21'; Updated=[DateTime]'2026-01-21'; DueDate=[DateTime]'2026-01-23' },
    [PSCustomObject]@{ Key='ISC-48'; Summary='University of Miami: Emergency Security Check - SafeLMS'; Status='ASSIGNED'; Priority='P3'; IssueType='RFP'; Product='SafeLMS'; Created=[DateTime]'2026-01-12'; Updated=[DateTime]'2026-01-14'; DueDate=[DateTime]'2026-01-16' },
    [PSCustomObject]@{ Key='ISC-42'; Summary='Security Assessment Questionnaires 2026'; Status='In Progress'; Priority='P3'; IssueType='Epic'; Product='Security Assessments'; Created=[DateTime]'2026-01-05'; Updated=[DateTime]'2026-01-27'; DueDate=[DateTime]'2026-12-31' }
)

$results = foreach ($t in $tickets) {
    $daysOpen = ($today - $t.Created).Days
    $daysSinceUpdate = ($today - $t.Updated).Days
    if ($t.DueDate) {
        $daysPastDue = ($today - $t.DueDate).Days
        $dueDateStr = $t.DueDate.ToString('yyyy-MM-dd')
    } else {
        $daysPastDue = 'N/A'
        $dueDateStr = 'No due date'
    }
    $urgency = if ($daysPastDue -is [int] -and $daysPastDue -ge 60) { 'CRITICAL' }
               elseif ($daysPastDue -is [int] -and $daysPastDue -ge 25) { 'HIGH' }
               elseif ($daysPastDue -is [int] -and $daysPastDue -ge 1) { 'MEDIUM' }
               else { 'LOW' }

    [PSCustomObject]@{
        'Ticket Key'        = $t.Key
        'Summary'           = $t.Summary
        'Status'            = $t.Status
        'Priority'          = $t.Priority
        'Issue Type'        = $t.IssueType
        'Product'           = $t.Product
        'Due Date'          = $dueDateStr
        'Created'           = $t.Created.ToString('yyyy-MM-dd')
        'Last Updated'      = $t.Updated.ToString('yyyy-MM-dd')
        'Days Open'         = $daysOpen
        'Days Since Update' = $daysSinceUpdate
        'Days Past Due'     = $daysPastDue
        'Urgency'           = $urgency
        'JIRA URL'          = ($baseUrl + $t.Key)
    }
}

$outputPath = 'C:\Users\joie.sayen\JIRA_Tickets_NeedAttention.csv'
$results | Export-Csv -Path $outputPath -NoTypeInformation
Write-Host "Exported to: $outputPath"
