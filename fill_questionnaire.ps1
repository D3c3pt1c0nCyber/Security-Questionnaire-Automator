$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

function SetCell($sheet, $row, $col, $value) {
    $sheet.Cells.Item($row, $col) = $value
}

# ============================
# LICENSING MODEL
# ============================
$lic = $wb.Sheets | Where-Object { $_.Name -eq 'Licencing Model' }

$a1 = 'Convergence LMS is offered as a subscription-based SaaS solution. Licensing is per user (seat-based), billed annually. The number of licensed seats is agreed at contract signing and can be scaled as needed.'
SetCell $lic 7 1 $a1

$a2 = 'Convergence LMS is available as a single product tier. Pricing scales based on number of users. Add-on modules may be available at additional cost. Please contact your Vector Solutions Account Executive for a detailed tier breakdown.'
SetCell $lic 11 1 $a2

$a3 = 'As a SaaS product, Convergence LMS is always on the latest version. Updates and upgrades are automatically deployed by Vector Solutions at no additional cost. Customers are never required to manage versioning.'
SetCell $lic 15 1 $a3

$a4 = 'Pricing is tailored based on number of users and contract terms. A detailed cost breakdown will be provided by your Vector Solutions Account Executive as part of the formal proposal process. Please contact Vector Solutions Sales for a customised quote.'
SetCell $lic 19 1 $a4

$a5 = 'The annual subscription includes platform access, all software updates, and standard customer support. Additional costs may apply for: initial implementation and onboarding, SSO/SAML integration setup, custom content development, premium support tiers, and custom integrations. These will be clearly outlined in the proposal.'
SetCell $lic 23 1 $a5

# ============================
# VENDOR CAPABILITIES
# ============================
$ven = $wb.Sheets | Where-Object { $_.Name -eq 'Vendor Capabilities' }

$v1 = 'Vector Solutions is headquartered in Tampa, Florida, USA. The company operates primarily across North America, with a growing international customer base. Support is provided globally via remote web-based channels.'
SetCell $ven 7 1 $v1

$v2 = 'Vector Solutions primarily serves public safety, industrial, utilities, healthcare, and corporate training sectors. For specific mining industry reference customers, please contact your Vector Solutions Account Executive.'
SetCell $ven 11 1 $v2

$v3 = 'Convergence LMS is currently available in English. The platform does not natively support multi-currency billing or jurisdiction-specific tax laws at the application layer. Custom SCORM/xAPI content in any language can be delivered through the platform.'
SetCell $ven 15 1 $v3

$v4 = 'Shared administration model: Vector Solutions manages all infrastructure, platform updates, security, and hosting. The customer is responsible for administering their own instance including managing users, assigning roles, uploading content, and configuring settings via customer-designated administrators.'
SetCell $ven 19 1 $v4

$v5 = 'As a SaaS platform, Convergence LMS receives continuous updates. Major feature releases are typically delivered quarterly, with security patches applied as needed. Release notes and product roadmap information are shared with customers via the Vector Solutions customer portal.'
SetCell $ven 23 1 $v5

$v6 = 'Support options include: (1) Online Help Center with 24/7 self-service documentation; (2) Email/Ticket support via customer portal with SLA-based response times; (3) Phone support during US business hours; (4) Dedicated Customer Success Manager for enterprise accounts; (5) Onboarding and training included during implementation. SLA details are specified in the customer agreement.'
SetCell $ven 27 1 $v6

# ============================
# AI
# ============================
$ai = $wb.Sheets | Where-Object { $_.Name -eq 'AI' }

$ai1 = 'Convergence LMS incorporates AI-assisted features through Microsoft Azure AI services. Specific AI model details depend on the feature context. Please confirm with your Vector Solutions Account Executive which AI features are active in your contracted instance.'
SetCell $ai 6 1 $ai1

$ai2 = 'No. AI capabilities in Convergence LMS are cloud-hosted and delivered via Microsoft Azure. On-premise deployment of AI/LLM components is not supported, consistent with the platform SaaS-only architecture.'
SetCell $ai 10 1 $ai2

$ai3 = 'AI features in Convergence LMS may include: intelligent course recommendations based on learner history and role, AI-assisted content authoring tools, automated reporting insights, and natural language search. Specific features available depend on contracted modules. Please consult your Account Executive for a current feature list.'
SetCell $ai 14 1 $ai3

$ai4 = 'Vector Solutions does not use customer data to train external AI models. Data processed by AI features is subject to the same data retention and security policies as all other customer data. AI interaction data is processed transiently and is not stored beyond what is required for platform operation.'
SetCell $ai 17 1 $ai4

$ai5 = 'No. Vector Solutions does not use customer data to train its AI/LLM models. Customer data remains confidential and is not shared with third-party AI model training processes. AI models used are pre-trained by their respective providers and are not fine-tuned on customer-specific data.'
SetCell $ai 21 1 $ai5

$ai6 = 'Upon contract termination, all customer data including AI-related data is handled per Vector Solutions standard data retention policy. Customers may request a full data export prior to termination. Following the contract grace period, all customer data is securely deleted. No customer data is retained for AI model use after contract termination.'
SetCell $ai 25 1 $ai6

$ai7 = 'Vector Solutions guarantees data confidentiality through: AES-256 encryption at rest and TLS 1.2/1.3 in transit; logical multi-tenant data isolation; role-based access controls; 24/7 SOC monitoring; NIST Cybersecurity Framework compliance; Microsoft Azure enterprise security controls; and contractual data processing agreements (DPA) available at https://www.vectorsolutions.com/dpa/'
SetCell $ai 29 1 $ai7

# ============================
# SaaS
# ============================
$saas = $wb.Sheets | Where-Object { $_.Name -eq 'SaaS (Software as a Service)' }

$s1 = 'No. Convergence LMS is a SaaS-only solution and is not available for on-premise deployment. All hosting, infrastructure management, and updates are managed by Vector Solutions on Microsoft Azure.'
SetCell $saas 8 2 $s1

$s2 = 'Supported browsers: Google Chrome, Mozilla Firefox, Microsoft Edge, and Apple Safari. All latest two major versions are supported. Internet Explorer is not supported. JavaScript must be enabled. No browser plugins required.'
SetCell $saas 16 2 $s2

$s3 = 'Standard internet connectivity over HTTPS port 443 is required. No VPN or dedicated network connection is needed. Recommended minimum bandwidth: 5 Mbps per concurrent user. If SSO is configured, connectivity to your IdP SAML endpoint is also required. Domain whitelisting may be required in restricted environments.'
SetCell $saas 20 2 $s3

$s4 = 'Convergence LMS is hosted entirely on Microsoft Azure, a Tier-1 enterprise cloud platform with SOC 2 Type II, ISO 27001, FedRAMP, and HIPAA-eligible certifications. All platform components are managed within Azure secure environment.'
SetCell $saas 29 2 $s4

$s5 = 'Data centres are located in the United States using Microsoft Azure East US and West US regions. All customer data is stored and processed within US-based Azure data centres. Data does not leave the United States unless expressly agreed upon in writing.'
SetCell $saas 32 2 $s5

$s6 = 'Vector Solutions targets 99.9% platform uptime excluding scheduled maintenance windows. Planned maintenance is communicated in advance. Current system status and historical uptime are available via the Vector Solutions status page. SLA details are in the customer service agreement.'
SetCell $saas 35 2 $s6

$s7 = 'Convergence LMS leverages Azure auto-scaling to handle variable demand. The platform dynamically scales compute and storage resources in response to load, ensuring consistent performance during peak usage periods. There is no hard cap on concurrent users.'
SetCell $saas 38 2 $s7

$s8 = 'Convergence LMS uses Azure geo-redundant storage and availability zones for high availability. Automated failover to secondary Azure regions is available in the event of a regional outage. Daily backups are stored in geographically separate locations. RTO/RPO details are available upon request.'
SetCell $saas 41 2 $s8

$s9 = 'Outbound HTTPS port 443 from user devices to Vector Solutions Azure-hosted endpoints is required. If SSO is configured, outbound SAML communication to your IdP is required. No inbound firewall rules are needed on the customer side. No VPN tunnel required.'
SetCell $saas 47 2 $s9

$s10 = 'Supported integration methods: (1) SAML 2.0 for SSO; (2) REST API for programmatic data access; (3) SCORM 1.2, SCORM 2004, xAPI, and AICC for eLearning content standards; (4) CSV/Excel bulk import/export; (5) Webhooks for event-driven integration; (6) LTI for content integration.'
SetCell $saas 50 2 $s10

$s11 = 'Data synchronisation is achieved through: real-time API calls for user provisioning; scheduled automated CSV imports for bulk updates; SCORM/xAPI completion data recorded in real-time; and event-driven webhooks that trigger on key events such as course completion and user enrolment.'
SetCell $saas 53 2 $s11

$s12 = 'Integration errors are managed through: standard HTTP error codes in API responses; error reports for failed bulk imports identifying specific records and reasons; SCORM/xAPI error logging in learner transcripts; and admin notifications for critical integration failures via dashboard and email.'
SetCell $saas 57 2 $s12

$s13 = 'Integration activity is monitored through the Convergence LMS admin dashboard, which provides API activity logs, import/export history, and system event logs. Vector Solutions support can provide additional diagnostic information for troubleshooting.'
SetCell $saas 60 2 $s13

$s14 = 'Dependencies: modern web browser; internet connectivity over HTTPS port 443; optional SAML-compliant Identity Provider for SSO. No local software installation, database, or server-side infrastructure required on the customer side.'
SetCell $saas 62 2 $s14

$s15 = 'Customer data is retained throughout the active contract period. Upon contract termination, customers may request a data export. Data is retained for a grace period of 30-90 days post-contract before secure deletion per Vector Solutions data disposal procedures.'
SetCell $saas 69 2 $s15

$s16 = 'Convergence LMS employs logical multi-tenancy with strict data isolation. Each customer data is stored in dedicated database schemas or partitions, ensuring no cross-tenant data access. Application-level access controls, API authentication, and Azure infrastructure-level security enforce isolation.'
SetCell $saas 73 2 $s16

$s17 = 'The customer retains full ownership of all data stored on Convergence LMS. Customers may request a complete data export at any time during the contract or upon termination. Data is exportable in standard formats including CSV and Excel. Following the grace period, all customer data is permanently and securely deleted.'
SetCell $saas 76 2 $s17

$s18 = 'https://app.vectorlmsconvergencetrainingedition.com - For security assessment purposes, please coordinate with your Vector Solutions Account Executive to arrange a dedicated test environment under NDA.'
SetCell $saas 80 2 $s18

# ============================
# Web Based
# ============================
$web = $wb.Sheets | Where-Object { $_.Name -eq 'Web Based' }

$w1 = 'Convergence LMS supports all modern web browsers: Google Chrome, Mozilla Firefox, Microsoft Edge, and Apple Safari. Latest two major versions are supported. Internet Explorer is not supported. JavaScript must be enabled. No browser plugins required.'
SetCell $web 10 2 $w1

$w2 = 'Standard internet connectivity over HTTPS port 443 is required. No VPN or dedicated connection needed. Recommended minimum bandwidth: 5 Mbps per concurrent user. Firewall rules should allow outbound traffic to Vector Solutions Azure-hosted domains. SSO requires access to your IdP SAML endpoint.'
SetCell $web 14 2 $w2

$w3 = 'No client-side database is required. All data is stored server-side on Vector Solutions Microsoft Azure infrastructure. Customers do not provision or manage any database components. The application database is fully managed by Vector Solutions on Azure SQL.'
SetCell $web 18 2 $w3

$w4 = 'Convergence LMS is hosted on Microsoft Azure, cloud-based and fully vendor-managed. Azure provides enterprise-grade security with SOC 2 Type II, ISO 27001, FedRAMP, and numerous other certifications. Customers do not manage or interact with the hosting infrastructure.'
SetCell $web 27 2 $w4

$w5 = 'All data centres are located within the United States using Microsoft Azure East US and West US regions. Customer data does not leave the United States. Azure geo-redundant storage ensures data resilience across multiple US regions.'
SetCell $web 30 2 $w5

$w6 = 'Vector Solutions targets 99.9% platform uptime. Scheduled maintenance windows are communicated in advance. Real-time status and historical uptime data are available via the Vector Solutions status page. SLA commitments are documented in the customer service agreement.'
SetCell $web 33 2 $w6

$w7 = 'The platform uses Azure auto-scaling to dynamically allocate resources in response to user demand. Performance is consistent regardless of concurrent user load. Content delivery is optimised through Azure CDN. Load testing is performed regularly to validate capacity under peak conditions.'
SetCell $web 36 2 $w7

$w8 = 'Azure geo-redundant storage and availability zones provide redundancy. Automated failover to secondary regions is available in the event of a regional outage. Daily backups are stored in geographically separate US-based locations. Business continuity procedures are maintained and tested. RTO and RPO targets are available on request.'
SetCell $web 39 2 $w8

$w9 = 'Outbound HTTPS port 443 from user devices to Vector Solutions Azure-hosted endpoints. Optional SAML IdP connectivity for SSO. No inbound firewall changes or VPN required on the customer network. Domain whitelisting may be required in restricted environments.'
SetCell $web 45 2 $w9

$w10 = 'Supported integration methods: SAML 2.0 for SSO, REST API, SCORM 1.2 / SCORM 2004 / xAPI / AICC for content standards, CSV/Excel import-export, Webhooks, and LTI. Custom integrations can be developed via the API for specific business requirements.'
SetCell $web 48 2 $w10

$w11 = 'Data is synchronised via real-time REST API calls, scheduled CSV imports, and event-driven webhooks. eLearning completion data is recorded in real-time. User provisioning can be automated via API or SCIM for directory synchronisation.'
SetCell $web 51 2 $w11

$w12 = 'API errors return standard HTTP status codes with descriptive error messages. Bulk import errors generate detailed error reports identifying failed records and reasons. Integration failures trigger admin alerts via dashboard and email notifications. All errors are logged for audit and troubleshooting.'
SetCell $web 55 2 $w12

$w13 = 'Integration activity is visible in the admin dashboard through API activity logs, import/export history, and event logs. Vector Solutions support can provide diagnostic logs for troubleshooting. Enterprise accounts may request dedicated integration health reviews.'
SetCell $web 58 2 $w13

$w14 = 'Dependencies: modern web browser; internet access over HTTPS port 443; optional SAML IdP for SSO; optional custom SMTP for email notifications. No local software, database, or server installation required on the customer side.'
SetCell $web 60 2 $w14

$w15 = 'Customer data is retained throughout the contract term. Customers may request a data export at any time. Following contract termination, data is held during a grace period of 30-90 days before secure deletion. Retention periods are configurable by contractual agreement.'
SetCell $web 66 2 $w15

$w16 = 'The customer owns all data stored on the platform. Data exports in standard formats including CSV and Excel are available at any time upon request. Upon contract termination, customers receive a final export opportunity before secure data deletion.'
SetCell $web 69 2 $w16

$w17 = 'https://app.vectorlmsconvergencetrainingedition.com - For security assessment, please coordinate with your Vector Solutions Account Executive to arrange a dedicated test environment.'
SetCell $web 73 2 $w17

# ============================
# Mobile
# ============================
$mob = $wb.Sheets | Where-Object { $_.Name -eq 'Mobile' }

$m1 = 'Convergence LMS is primarily accessed via mobile browsers using responsive web design. The app connects to the Azure-hosted backend over HTTPS port 443 using REST API calls and standard web protocols. A dedicated native mobile app may be available - please confirm with your Vector Solutions Account Executive.'
SetCell $mob 10 2 $m1

$m2 = 'No middleware components are required for browser-based mobile access. If SSO is configured, the mobile browser interacts with the customer IdP via SAML 2.0. Azure API Gateway manages backend service routing internally.'
SetCell $mob 14 2 $m2

$m3 = 'Supported authentication methods: username/password, SAML 2.0 SSO which can enforce MFA via the IdP. Biometric authentication is supported at the device browser level through device-native credential managers.'
SetCell $mob 18 2 $m3

$m4 = 'Convergence LMS is accessible via mobile browsers on both iOS (Safari on iOS 14 and later) and Android (Chrome on Android 8 and later). The responsive web design adapts to all screen sizes. For native mobile app availability, please confirm with your Account Executive.'
SetCell $mob 22 2 $m4

$m5 = 'Convergence LMS is accessed via web browser and no app download is required for standard access. If a native mobile app is available, it would be distributed through the Apple App Store and Google Play Store. Please confirm native app availability with your Vector Solutions Account Executive.'
SetCell $mob 26 2 $m5

$m6 = 'Yes. All data is encrypted in transit using TLS 1.2 and TLS 1.3. Data at rest is encrypted using AES-256 on the server side via Azure. For browser-based mobile access, no sensitive data is persistently stored on the device beyond standard browser cache.'
SetCell $mob 32 2 $m6

$m7 = 'As a browser-based application, Convergence LMS is compatible with all MDM/EMM solutions including Intune, AirWatch, and MobileIron that manage the device and browser. MDM policies applied to the device apply to Convergence LMS access. No specific MDM integration within Convergence is required.'
SetCell $mob 36 2 $m7

$m8 = 'Convergence LMS does not natively detect jailbroken or rooted devices. Protection against compromised devices should be enforced at the MDM/EMM layer. When SSO is configured, conditional access policies in the IdP such as Azure AD Conditional Access can be used to restrict access from non-compliant devices.'
SetCell $mob 40 2 $m8

$m9 = 'Yes. Role-based access control is fully inherited from the application regardless of access device. The same 8 pre-configured roles apply consistently across all access methods including mobile browsers. Users see only the content and features their assigned role permits.'
SetCell $mob 44 2 $m9

$m10 = 'Access controls are enforced at the application level via username/password and SAML 2.0 SSO. MFA is enforced through the IdP when SSO is configured. Password policies are managed by the customer IdP when SSO is enabled, or through the built-in password policy for non-SSO users.'
SetCell $mob 48 2 $m10

$m11 = 'All communications use TLS 1.2 and TLS 1.3 for transport security. No VPN is required. The platform does not mandate VPN use on public Wi-Fi, but customers may enforce this through their own MDM policies. Certificate-level protections are implemented at the infrastructure level.'
SetCell $mob 52 2 $m11

$m12 = 'For browser-based access, data is cached in the browser standard cache only. No sensitive data is persistently stored on the device. SCORM content may cache temporarily for offline playback but completion data is transmitted to the server when connectivity is restored. Session data is cleared upon logout.'
SetCell $mob 60 2 $m12

$m13 = 'Mobile access to Convergence LMS is subject to the same GDPR and POPIA compliance measures as all other access methods. Vector Solutions DPA governs data processing obligations and is available at https://www.vectorsolutions.com/dpa/. Data collected via mobile access is stored in US-based Azure data centres.'
SetCell $mob 64 2 $m13

$m14 = 'As a SaaS web-based platform, updates to Convergence LMS are deployed server-side automatically. Users always access the latest version without any action required on the device. If a native mobile app is available, updates are distributed through the respective app stores on a regular release cycle.'
SetCell $mob 72 2 $m14

$m15 = 'Mobile access is monitored through the same platform-wide monitoring tools: session logs, audit logs, and the admin dashboard provide visibility into user access including mobile sessions. Azure Monitor and Vector Solutions 24/7 SOC provide infrastructure-level monitoring.'
SetCell $mob 80 2 $m15

# ============================
# On Premise - Mark N/A
# ============================
$onprem = $wb.Sheets | Where-Object { $_.Name -eq 'On Premise Deployment' }
SetCell $onprem 4 2 'N/A - Convergence LMS is a SaaS-only solution. On-premise deployment is not available. All infrastructure is managed by Vector Solutions on Microsoft Azure.'

# ============================
# Edge - Mark N/A
# ============================
$edge = $wb.Sheets | Where-Object { $_.Name -eq 'Edge deployments' }
SetCell $edge 4 2 'N/A - Convergence LMS does not support edge deployment. It is a cloud-based SaaS application accessed via web browser over standard internet connectivity.'

# ============================
# A. Application Capabilities - Update row 9
# ============================
$appCap = $wb.Sheets | Where-Object { $_.Name -eq 'A. Application Capabilities' }
$appCap.Cells.Item(9, 6) = ""
$appCap.Cells.Item(9, 9) = "X"
$appCap.Cells.Item(9, 3) = "File and folder comparison and synchronisation"
$appCap.Cells.Item(9, 4) = "N/A - Convergence LMS is a Learning Management System. File/folder sync is not a feature of this platform."

# ============================
# Save
# ============================
$wb.Save()
$wb.Close($false)
$excel.Quit()
Write-Host "Done. Questionnaire filled and saved."
