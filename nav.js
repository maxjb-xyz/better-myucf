/**
 * myUCF — hierarchical navigation model (area → page → sub-page tabs).
 *
 * Replaces the flat SIDEBAR_SECTIONS list in content.js with a tree that
 * mirrors how the app is actually organized: each homepage tile opens a
 * PeopleSoft component whose LEFT VERTICAL TAB RAIL (psa_vtab) lists the
 * sub-pages. The sidebar now exposes that whole tree in one place.
 *
 * Sourced from live myUCF captures (csprod-ss.net.ucf.edu, Summer 2026):
 *   - "Manage Classes" tab rail (14 sub-pages) — labels confirmed.
 *   - "To Do List" (single page) — confirmed.
 *   - "Academic Records" tab rail (~21 sub-pages) — component IDs captured,
 *     display labels still pending a text-enabled capture (see TBD markers).
 *
 * MATCHING RULE (important):
 *   PeopleSoft renders each sub-page as a tab with class `psa_tab_<COMPONENT>`.
 *   Oracle component IDs are stable; UCF-custom tabs carry hashed, timestamped
 *   IDs (e.g. UCF_S2026…) that regenerate. So routing must match by LABEL
 *   (the visible text, which is stable) — NOT by hashed component ID. Each
 *   sub-page therefore carries `label` (match key + display) and, where the
 *   Oracle component is stable, an optional `component` for a stronger match.
 *
 * Exposed as `self.MYUCF.NAV` (loaded before content.js, mirroring defaults.js).
 */
(() => {
  "use strict";

  const BASE = "https://csprod-ss.net.ucf.edu/psc/CSPROD/EMPLOYEE/SA/c";

  // Top-level page deep links (unchanged from the prior sidebar — verified live).
  const PAGES = {
    tasks: {
      label: "Holds & To-Dos",
      url: BASE + "/SCC_TASKS_FL.SCC_TASKS_START_FL.GBL?GMenu=SCC_TASKS_FL&GComp=SCC_TASKS_SP_FL&GPage=SCC_START_PAGE_FL&scname=CS_TASKS",
      component: "SCC_TASKS_FL",
      tabs: [{ label: "To Do List", component: "SCC_TODO_LIST_FL" }],
    },
    manageClasses: {
      label: "Manage Classes",
      url: BASE + "/SSR_STUDENT_FL.SSR_START_PAGE_FL.GBL?GMenu=SSR_STUDENT_FL&GComp=SSR_START_PAGE_FL&GPage=SSR_START_PAGE_FL&scname=CS_SSR_MANAGE_CLASSES_NAV",
      component: "SSR_STUDENT_FL",
      tabs: [
        { label: "View My Classes/Schedule", component: "SSR_VW_CLASS_FL" },
        { label: "View Course History", component: "SSR_CRSE_HIST_FL" },
        { label: "Add Classes/Shopping Cart" },                       // UCF hashed id — match by label
        { label: "Drop Classes" },                                    // UCF hashed id
        { label: "Swap Classes" },                                    // UCF hashed id
        { label: "View Enrollment Window", component: "SSR_TERM_STA4_FL" },
        { label: "Browse Course Catalog" },                           // UCF hashed id
        { label: "Enrollment Verification" },                         // UCF hashed id
        { label: "Class Search" },                                    // UCF hashed id
        { label: "View What-if Report", component: "HC_SAA_SS_WHATIF_SEL_GBL" },
        { label: "myScheduleBuilder" },                               // UCF hashed id
        { label: "myKnightAudit" },                                   // UCF hashed id
        { label: "Pegasus Path", component: "UA_DT_SS_PLAN" },
        { label: "View My Advisors" },                                // UCF hashed id
      ],
    },
    admissions: {
      label: "Admissions",
      url: BASE + "/NUI_FRAMEWORK.PT_AGSTARTPAGE_NUI.GBL?CONTEXTIDPARAMS=TEMPLATE_ID%3aPTPPNAVCOL&scname=UCF_ADMISSIONS&PanelCollapsible=Y&PTPPB_GROUPLET_ID=FX_UCF_ADMISSIONS&CRefName=UCF_NAVCOLL_2",
    },
    academicRecords: {
      label: "Academic Records",
      url: BASE + "/SSR_STUDENT_ACAD_REC_FL.SSR_SP_ACAD_REC_FL.GBL?GMenu=SSR_STUDENT_ACAD_REC_FL&GComp=SSR_ACADREC_NAV_FL&GPage=SCC_START_PAGE_FL&scname=CS_SSR_ACADEMIC_RECORDS_FL",
      component: "SSR_STUDENT_ACAD_REC_FL",
      // Component IDs captured live; display labels pending a text-enabled
      // capture. Oracle IDs decode to the working names below — VERIFY against
      // the live rail before trusting (the FX_* items are UCF-custom).
      tabs: [
        { label: "View Grades", component: "SSR_VWGD_GRADE_FL" },
        { label: "TBD (UCF tab)", component: "UCF_S202605121010262350879443" },
        { label: "TBD (UCF tab)", component: "UCF_S202605061558525030845541" },
        { label: "Grades Status", component: "FX_AR_GRADES_STATUS" },
        { label: "View Course History", component: "SSR_CRSE_HIST_FL" },
        { label: "Transcripts", component: "FX_AR_TRASNCRIPTS" },
        { label: "Change Major", component: "FX_ACAD_REC_DEG_CHG_MAJ" },
        { label: "Change Status/Level", component: "FX_ACAD_REC_DEG_CHG_STAT" },
        { label: "Placement Tests", component: "FX_AR_OTHER_PLACE_TST" },
        { label: "Readmission", component: "FX_ACAD_REC_ADM_READD" },
        { label: "Withdrawal", component: "FX_ACAD_REC_OTH_WITHDWL" },
        { label: "Transfer Admission", component: "FX_ACAD_REC_ADM_TRANS" },
        { label: "Apply for Graduation", component: "FX_AR_GRAD_APPLY" },
        { label: "Graduation Status", component: "FX_AR_GRAD_ITG_STAT2" },
        { label: "Graduation Survey", component: "FX_ACAD_REC_GRAD_SURVEY" },
        { label: "TBD (UCF tab)", component: "UCF_S202604131436196516370622" },
        { label: "TBD (UCF tab)", component: "UCF_S202605291507297338999978" },
        { label: "TBD (UCF tab)", component: "UCF_S202606190940131489869841" },
        { label: "TBD (UCF tab)", component: "UCF_S202606190941028105159121" },
      ],
    },
    studentFinancials: {
      label: "Student Financials",
      url: BASE + "/SSF_STUDENT_FL.SSF_FIN_ACCT_ML_FL.GBL?GMenu=SSF_STUDENT_FL&GComp=SSF_FIN_ACCT_ML_FL&GPage=SCC_START_PAGE_FL&scname=UCF_FX_FINANCIAL_ACCOUNT",
      component: "SSF_STUDENT_FL",
      tabs: [
        { label: "Account Balance", component: "SSF_ACCT_BAL_FL" },
        { label: "Make a Payment" },                            // UCF hashed id
        { label: "Statement of Charges" },                      // UCF hashed id
        { label: "Student Direct Deposit", component: "SSF_DIRDEP_LAND_FL" },
        { label: "UCF Fee Invoice", component: "FX_SF_FEEINV_TERMS" },
        { label: "1098-T Tax Management", component: "FX_SF_1098T_EDELSS" },
        { label: "View My Account", component: "FX_VIEW_ACCOUNT_SF" },
        { label: "Florida PrePaid Management" },                // UCF hashed id
        { label: "Tuition Payment Plan" },                      // UCF hashed id
      ],
    },
    financialAid: {
      label: "Financial Aid",
      url: BASE + "/SFA_STUDENT_FL.SFA_SS_START_PG_FL.GBL?GMenu=SFA_STUDENT_FL&GComp=SFA_SS_START_PG_FL&GPage=SFA_SS_START_PG_FL&scname=UCF_UCF_FINANCIALAID_TILE&scnamesff=UCF_UCF_FINANCIALAID_TILE&pslnkid=FX_FINANCIAL_AID",
      component: "SFA_STUDENT_FL",
      tabs: [
        { label: "Award Summary" },                             // UCF hashed id
        { label: "Accept/Decline" },                            // UCF hashed id
        { label: "Disbursement" },                              // UCF hashed id
        { label: "Financial Aid Status" },                      // UCF hashed id
        { label: "Report Other Financial Aid" },                // UCF hashed id
        { label: "Textbook Opt In" },                           // UCF hashed id
        { label: "Textbook Status" },                           // UCF hashed id
        { label: "Correct Housing Status" },                    // UCF hashed id
        { label: "View My Eligible Courses" },                  // UCF hashed id
      ],
    },
    profile: {
      label: "Profile",
      url: BASE + "/SCC_PROFILE_FL.SCC_PROFILE_FL.GBL?GMenu=SCC_PROFILE_FL&GComp=SCC_PROFILE_SP_FL&GPage=SCC_START_PAGE_FL&scname=CS_PERSON_PROFILE&scnamem=CS_PERSON_PROFILEMF",
      component: "SCC_PROFILE_FL",
      tabs: [
        { label: "Personal Details", component: "SCC_PERS_DTLS_FL" },
        { label: "Contact Details", component: "SCC_CONTACT_DTL_FL" },
        { label: "Addresses", component: "SCC_ADDRESS_DTL_FL" },
        { label: "Emergency Contacts", component: "SCC_EMERG_CNTCT_FL" },
        { label: "Ethnicity", component: "SCC_ETHNIC_US_FL" },
        { label: "FERPA restrictions", component: "SCC_FERPA_RES_FL" },
        { label: "Record Release Authorization" },            // UCF hashed id
        { label: "UCFID Info" },                              // UCF hashed id
        { label: "Veteran Certification", component: "FX_AR_OTHER_VET_CERT" },
        { label: "Missing Person Contact", component: "FX_PERSON_OTHR_MISSING" },
      ],
    },
    international: {
      label: "International Students",
      url: BASE + "/FX_FLUID_MENU.FX_SSR_INTL_STDNT.GBL?GMenu=FX_FLUID_MENU&GComp=FX_SSR_INTL_STDNT&GPage=SSR_START_PAGE_FL&scname=UCF_INTERNATIONAL_STUDENTS",
    },
  };

  const NAV = [
    { section: "Tasks", pages: [PAGES.tasks] },
    { section: "Academics", pages: [PAGES.manageClasses, PAGES.academicRecords, PAGES.admissions] },
    { section: "Finances", pages: [PAGES.studentFinancials, PAGES.financialAid] },
    { section: "Personal", pages: [PAGES.profile, PAGES.international] },
  ];

  const FOOTER = [
    { label: "Home", url: "https://csprod-ss.net.ucf.edu/psc/CSPROD/EMPLOYEE/SA/s/WEBLIB_PTBR.ISCRIPT1.FieldFormula.IScript_StartPage" },
    { label: "Sign Out", url: "https://csprod-ss.net.ucf.edu/psp/CSPROD/EMPLOYEE/SA/?cmd=logout" },
  ];

  self.MYUCF = Object.assign({}, self.MYUCF, { NAV, NAV_FOOTER: FOOTER, NAV_BASE: BASE });
})();
