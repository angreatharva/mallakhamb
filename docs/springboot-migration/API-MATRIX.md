# API compatibility matrix (generated)

Generated from `Server/docs/openapi.json` by `tools/gen-api-matrix.js`. **220 operations.**
Every row is also served under `/api/v1`. The Java side must answer both prefixes identically.

Columns: *Java module* is the first assignment (see 02 §3). *Java handler*, *Frontend change*,
*Status* and *Notes* are maintained by hand and survive re-generation. *Status* values:
`Not started` → `Ported` → `Diff-green` (differential test passes against Node) → `Accepted`.
A Frontend change other than `None` needs owner approval first (02 §6).

| Module | Ops |
|---|---|
| competition | 32 |
| identity | 44 |
| panel | 22 |
| payment | 12 |
| platform | 6 |
| registration | 29 |
| results | 12 |
| runningorder | 11 |
| scoring | 18 |
| stats | 4 |
| team | 11 |
| walkin | 19 |

| Module | Method | Path | operationId | Summary | Auth | Java handler | Frontend change | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| competition | POST | `/api/admin/age-groups/{ageGroup}/end` | adminEndAgeGroup | Close a category and lock its scores | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/admin/age-groups/start` | adminStartAgeGroup | Open a category for scoring | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/admin/age-groups/status` | adminAgeGroupStatus | Which categories are open, started or ended | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/admin/dashboard` | adminDashboard | Dashboard statistics | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/admin/dashboard/stats` | adminDashboardStats | Dashboard statistics | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/admin/system/health` | adminSystemHealth | System health as seen by an admin | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/auth/competitions/assigned` | assignedCompetitions | Competitions this principal may act in | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/coaches/competition/team-status` | coachTeamStatus | Entry status of the coach's team | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/coaches/competitions/open` | coachOpenCompetitions | Competitions open for entry | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/coaches/select-competition` | coachSelectCompetition | Choose the competition to work in | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/competitions` | listCompetitions | All competitions | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/competitions` | createCompetition | Create a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | DELETE | `/api/competitions/{id}` | deleteCompetition | Delete a competition (soft) | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/competitions/{id}` | getCompetition | Competition by id | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | PUT | `/api/competitions/{id}` | updateCompetition | Update a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/competitions/{id}/admins` | competitionAssignAdmin | Assign an admin to a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | DELETE | `/api/competitions/{id}/admins/{adminId}` | competitionRemoveAdmin | Remove an admin from a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | PATCH | `/api/competitions/{id}/status` | updateCompetitionStatus | Change competition status | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/competitions/status/{status}` | competitionsByStatus | Competitions in a given status | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/competitions/upcoming` | upcomingCompetitions | Upcoming competitions | none |  | None | Not started |  |
| competition | GET | `/api/players/competitions/open` | playerOpenCompetitions | Competitions open for registration | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/superadmin/age-groups/start` | superAdminStartAgeGroup | Open a category for scoring | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/superadmin/competition/age-group/start` | superAdminStartAgeGroupAlias | Open a category for scoring (alias) | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/superadmin/competitions` | superAdminListCompetitions | All competitions | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/superadmin/competitions` | superAdminCreateCompetition | Create a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | DELETE | `/api/superadmin/competitions/{id}` | superAdminDeleteCompetition | Delete a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/superadmin/competitions/{id}` | superAdminGetCompetition | Competition by id | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | PUT | `/api/superadmin/competitions/{id}` | superAdminUpdateCompetition | Update a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | POST | `/api/superadmin/competitions/{id}/admins` | superAdminAssignAdmin | Assign an admin to a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | DELETE | `/api/superadmin/competitions/{id}/admins/{adminId}` | superAdminRemoveAdmin | Remove an admin from a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/superadmin/dashboard` | superAdminDashboard | Platform dashboard | bearerAuth, cookieAuth |  | None | Not started |  |
| competition | GET | `/api/superadmin/stats` | superAdminStats | Platform-wide counts | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/admin/login` | loginAdmin | Admin login | none |  | None | Not started |  |
| identity | POST | `/api/admin/register` | registerAdmin | Create an admin | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/auth/forgot-password` | forgotPassword | Send a password-reset OTP | none |  | None | Not started |  |
| identity | POST | `/api/auth/logout` | authLogout | Log out | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | GET | `/api/auth/me` | authMe | The authenticated principal | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | PUT | `/api/auth/me` | updateOwnAccount | Edit own profile | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | GET | `/api/auth/me/account` | getOwnAccount | Own account, for the profile page | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | DELETE | `/api/auth/me/email` | cancelOwnEmailChange | Cancel an email change in progress | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/auth/me/email` | requestOwnEmailChange | Start an email change | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/auth/me/email/confirm` | confirmOwnEmailChange | Finish an email change with the mailed code | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | PUT | `/api/auth/me/password` | changeOwnPassword | Change own password | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/auth/refresh` | authRefresh | Exchange the refresh cookie for a new access token | none |  | None | Not started |  |
| identity | POST | `/api/auth/reset-password-coach` | resetPasswordCoach | Reset a password with the code from your coach | none |  | None | Not started |  |
| identity | POST | `/api/auth/reset-password-otp` | resetPasswordOtp | Reset a password with an OTP | none |  | None | Not started |  |
| identity | POST | `/api/auth/set-competition` | setCompetition | Bind the session to a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/auth/verify-otp` | verifyOtp | Verify a reset OTP | none |  | None | Not started |  |
| identity | GET | `/api/coaches/account-requests` | coachAccountRequests | Resets and email additions waiting for approval | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/coaches/account-requests/{requestId}/approve` | coachApproveAccountRequest | Approve a request | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/coaches/account-requests/{requestId}/reject` | coachRejectAccountRequest | Turn a request down | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/coaches/login` | loginCoach | Coach login | none |  | None | Not started |  |
| identity | GET | `/api/coaches/player-default-password` | coachGetPlayerDefaultPassword | The default password for players this coach registers | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | PUT | `/api/coaches/player-default-password` | coachSetPlayerDefaultPassword | Set or change the default player password | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | GET | `/api/coaches/profile` | coachProfile | Own profile | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/coaches/register` | registerCoach | Register a coach | none |  | None | Not started |  |
| identity | GET | `/api/coaches/status` | coachStatus | Onboarding status | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/judge/login` | loginJudge | Judge login | none |  | None | Not started |  |
| identity | GET | `/api/judge/profile` | judgeProfile | Own profile | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | PUT | `/api/judge/profile` | judgeUpdateProfile | Update own profile | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | PUT | `/api/judge/profile/password` | judgeChangePassword | Change own password | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/judge/register` | registerJudge | Judge self-registration | none |  | None | Not started |  |
| identity | POST | `/api/players/login` | loginPlayer | Athlete login | none |  | None | Not started |  |
| identity | GET | `/api/players/profile` | playerProfile | Own profile | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/players/register` | registerPlayer | Register an athlete | none |  | None | Not started |  |
| identity | GET | `/api/superadmin/account-requests` | superAdminAccountRequests | Resets and email additions waiting for approval | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/superadmin/account-requests/{requestId}/approve` | superAdminApproveAccountRequest | Approve a request | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/superadmin/account-requests/{requestId}/reject` | superAdminRejectAccountRequest | Turn a request down | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | GET | `/api/superadmin/admins` | superAdminListAdmins | All admins | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/superadmin/admins` | superAdminCreateAdmin | Create an admin | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | DELETE | `/api/superadmin/admins/{adminId}` | superAdminDeleteAdmin | Delete an admin | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | PUT | `/api/superadmin/admins/{adminId}` | superAdminUpdateAdmin | Update an admin | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | GET | `/api/superadmin/coaches` | superAdminListCoaches | All coaches | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | PUT | `/api/superadmin/coaches/{coachId}/status` | superAdminCoachStatus | Activate a coach | bearerAuth, cookieAuth |  | None | Not started |  |
| identity | POST | `/api/superadmin/login` | loginSuperAdmin | Super admin login | none |  | None | Not started |  |
| identity | POST | `/api/superadmin/players/add` | superAdminAddPlayer | Add an athlete to an entry directly | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/admin/judge-accounts` | adminSearchJudgeAccounts | Search registered judges to seat | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/admin/judges` | adminGetJudges | The panel seated for a category and apparatus | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | POST | `/api/admin/judges` | adminCreateJudge | Seat one judge | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | DELETE | `/api/admin/judges/{judgeId}` | adminDeleteJudge | Empty a seat | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | PUT | `/api/admin/judges/{judgeId}` | adminUpdateJudge | Change who sits in a seat | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | POST | `/api/admin/judges/bulk` | adminSaveJudgesBulk | Seat a whole panel | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/admin/judges/summary` | adminJudgesSummary | Panel coverage across every category | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/judge/assignments` | judgeAssignments | Every panel seat this account holds | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/judge/competition/{competitionId}` | judgeCompetitionDetails | Competition detail for a judge | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | PUT | `/api/judge/competition/{competitionId}/set` | judgeSetCompetition | Bind the judge session to a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/judge/competitions` | judgeCompetitions | Competitions this judge is seated in | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/judge/judges` | judgePanel | The panel this judge sits on | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/judge/judges/summary` | judgePanelSummary | Panel coverage summary | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/judge/teams/{teamId}/players` | judgeTeamPlayers | One team's athletes in a category | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/public/judges` | publicJudges | The panel for a category | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/superadmin/judge-accounts` | superAdminSearchJudgeAccounts | Search registered judges | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/superadmin/judges` | superAdminGetJudges | The panel for a category | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | POST | `/api/superadmin/judges` | superAdminCreateJudge | Seat one judge | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | DELETE | `/api/superadmin/judges/{judgeId}` | superAdminDeleteJudge | Empty a seat | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | PUT | `/api/superadmin/judges/{judgeId}` | superAdminUpdateJudge | Change who sits in a seat | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | POST | `/api/superadmin/judges/bulk` | superAdminSaveJudgesBulk | Seat a whole panel | bearerAuth, cookieAuth |  | None | Not started |  |
| panel | GET | `/api/superadmin/judges/summary` | superAdminJudgesSummary | Panel coverage | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | GET | `/api/admin/transactions` | adminTransactions | Payments, filtered and paginated | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | GET | `/api/admin/transactions/{transactionId}` | adminTransactionDetails | One payment | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | GET | `/api/admin/transactions/summary` | adminPaymentSummary | Payment totals for a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | POST | `/api/coaches/payments/create-order` | coachCreateOrder | Create the Razorpay order for a squad entry | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | POST | `/api/coaches/payments/discount/redeem` | coachRedeemDiscount | Redeem a 100%-off discount code and final-submit the squad | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | POST | `/api/coaches/payments/discount/validate` | coachValidateDiscount | Price the entry with a discount code, without submitting | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | POST | `/api/coaches/payments/verify-and-submit` | coachVerifyAndSubmit | Verify payment and final-submit the squad | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | POST | `/api/public/payments/razorpay/webhook` | razorpayWebhookPublic | Razorpay webhook | none |  | None | Not started |  |
| payment | POST | `/api/superadmin/players/payment/create` | superAdminCreatePlayerPayment | Create a per-athlete payment order | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | POST | `/api/superadmin/players/payment/verify` | superAdminVerifyPlayerPayment | Verify a per-athlete payment and add the athlete | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | GET | `/api/superadmin/transactions` | superAdminTransactions | All payments | bearerAuth, cookieAuth |  | None | Not started |  |
| payment | POST | `/api/webhooks/razorpay` | razorpayWebhook | Razorpay webhook (preferred path) | none |  | None | Not started |  |
| platform | GET | `/api/csrf-token` | csrfToken | Issue a CSRF token | none |  | None | Not started |  |
| platform | GET | `/api/health` | health | Detailed health check | none |  | None | Not started |  |
| platform | GET | `/api/health-legacy` | healthLegacy | Legacy liveness string | none |  | None | Not started |  |
| platform | GET | `/api/health/live` | healthLive | Liveness probe | none |  | None | Not started |  |
| platform | GET | `/api/health/ping` | healthPing | Uptime ping | none |  | None | Not started |  |
| platform | GET | `/api/health/ready` | healthReady | Readiness probe | none |  | None | Not started |  |
| registration | GET | `/api/admin/players` | adminListPlayers | Athletes entered in the competition, filtered and paginated | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/admin/players/{playerId}` | adminPlayerDetails | Athlete detail with scores | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | PUT | `/api/admin/players/{playerId}/status` | adminUpdatePlayerStatus | Activate or deactivate an athlete | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | PUT | `/api/admin/players/{playerId}/team` | adminAssignPlayerTeam | Move an athlete to a team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/admin/teams` | adminListTeams | Entered teams, filtered and paginated | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/admin/teams/{teamId}` | adminTeamDetails | Team detail | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | PUT | `/api/admin/teams/{teamId}/approve` | adminApproveTeam | Approve a team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | PUT | `/api/admin/teams/{teamId}/reject` | adminRejectTeam | Reject a team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/admin/teams/submitted` | adminSubmittedTeams | Submitted teams with per-athlete scoring state | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | POST | `/api/coaches/add-player` | coachAddPlayer | Add an athlete to a squad place | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/coaches/dashboard` | coachDashboard | Squad dashboard | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | POST | `/api/coaches/players` | coachRegisterPlayer | Register a player with no email onto this coach’s team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | DELETE | `/api/coaches/remove-player/{playerId}` | coachRemovePlayer | Remove an athlete from the squad | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/coaches/search-players` | coachSearchPlayers | Find registered athletes to add to a squad | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | POST | `/api/coaches/team/{teamId}/register-competition` | coachRegisterTeam | Enter a team in a competition | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | POST | `/api/competitions/{competitionId}/register` | competitionRegisterTeam | Enter a team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | DELETE | `/api/competitions/{competitionId}/register/{teamId}` | competitionUnregisterTeam | Withdraw a team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/competitions/{competitionId}/registrations` | competitionRegistrations | Entries in a competition, paginated | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/competitions/{competitionId}/teams/{teamId}` | competitionTeamRegistration | One team's entry detail | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | POST | `/api/competitions/{competitionId}/teams/{teamId}/players` | competitionAddPlayer | Add an athlete to an entry | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | DELETE | `/api/competitions/{competitionId}/teams/{teamId}/players/{playerId}` | competitionRemovePlayer | Remove an athlete from an entry | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/players/team` | playerTeam | The athlete's team in the current competition | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | POST | `/api/players/team/join` | playerJoinTeam | Join a team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/players/teams` | playerAvailableTeams | Teams an athlete may join | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/public/submitted-teams` | publicSubmittedTeams | Submitted teams | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/superadmin/submitted-teams` | superAdminSubmittedTeamsAlias | Submitted teams (alias) | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | GET | `/api/superadmin/teams/submitted` | superAdminSubmittedTeams | Submitted teams | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | DELETE | `/api/teams/{id}/players` | teamRemovePlayer | Remove an athlete from a team | bearerAuth, cookieAuth |  | None | Not started |  |
| registration | POST | `/api/teams/{id}/players` | teamAddPlayer | Add an athlete to a team | bearerAuth, cookieAuth |  | None | Not started |  |
| results | GET | `/api/admin/rankings/individual` | adminIndividualRankings | Individual rankings | bearerAuth, cookieAuth |  | None | Not started |  |
| results | GET | `/api/admin/rankings/team` | adminTeamRankings | Team rankings | bearerAuth, cookieAuth |  | None | Not started |  |
| results | GET | `/api/admin/scores/team-rankings` | adminTeamRankingsAlias | Team rankings (alias) | bearerAuth, cookieAuth |  | None | Not started |  |
| results | DELETE | `/api/admin/tie-break/draws` | adminClearTieBreakDraw | Remove a recorded lucky draw | bearerAuth, cookieAuth |  | None | Not started |  |
| results | POST | `/api/admin/tie-break/draws` | adminRecordTieBreakDraw | Record the lucky draw for one tied group | bearerAuth, cookieAuth |  | None | Not started |  |
| results | GET | `/api/public/competitions` | publicCompetitions | Competitions for the public site | none |  | None | Not started |  |
| results | GET | `/api/public/cop-rules` | publicCopRules | The COP scoring constants | none |  | None | Not started |  |
| results | GET | `/api/public/team-championship` | publicTeamChampionship | Team Championship standing for one category | none |  | None | Not started |  |
| results | GET | `/api/public/teams` | publicTeams | Submitted teams for the public score filters | none |  | None | Not started |  |
| results | GET | `/api/superadmin/scores/team-rankings` | superAdminTeamRankings | Team rankings | bearerAuth, cookieAuth |  | None | Not started |  |
| results | DELETE | `/api/superadmin/tie-break/draws` | superAdminClearTieBreakDraw | Remove a recorded lucky draw | bearerAuth, cookieAuth |  | None | Not started |  |
| results | POST | `/api/superadmin/tie-break/draws` | superAdminRecordTieBreakDraw | Record the lucky draw for one tied group | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | GET | `/api/admin/lots` | adminGetLots | The running order for a category | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | POST | `/api/admin/lots/draw` | adminDrawLots | Draw lots | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | PUT | `/api/admin/lots/players` | adminSetPlayerOrder | Set one team's athlete order | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | PUT | `/api/admin/lots/teams` | adminSetTeamOrder | Set the team running order | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | GET | `/api/judge/lots` | judgeGetLots | Read the running order | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | PUT | `/api/judge/lots/players` | judgeSetPlayerOrder | Re-sequence one team's athletes | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | PUT | `/api/judge/lots/teams` | judgeSetTeamOrder | Re-sequence the teams | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | GET | `/api/superadmin/lots` | superAdminGetLots | Running order | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | POST | `/api/superadmin/lots/draw` | superAdminDrawLots | Draw lots | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | PUT | `/api/superadmin/lots/players` | superAdminSetPlayerOrder | Set one team's athlete order | bearerAuth, cookieAuth |  | None | Not started |  |
| runningorder | PUT | `/api/superadmin/lots/teams` | superAdminSetTeamOrder | Set the team order | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | PUT | `/api/admin/scores/{scoreId}/players/{playerId}/unlock` | adminUnlockPlayerForJudges | Reopen one athlete for the judges | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | PUT | `/api/admin/scores/{scoreId}/unlock` | adminUnlockScore | Unlock one score sheet for correction | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | GET | `/api/admin/scores/individual` | adminIndividualScores | Athlete-by-athlete scores for a category | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | PUT | `/api/admin/scores/lock` | adminLockScores | Lock every score sheet in an age group | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | POST | `/api/admin/scores/recalculate` | adminRecalculateScores | Recompute every score in an age group | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | POST | `/api/admin/scores/save` | adminSaveScores | Write a judge slip or a whole score sheet | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | GET | `/api/admin/scores/team` | adminTeamScores | Team-by-team scores for a category | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | POST | `/api/judge/scores/save` | judgeSaveScores | Write a slip or a score sheet (shared handler) | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | GET | `/api/judge/scores/team` | judgeTeamScores | Team scores (Scorer interface) | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | POST | `/api/public/save-score` | publicSaveScore | Write a judge slip | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | GET | `/api/public/scores` | publicScores | Published results | none |  | None | Not started |  |
| scoring | PUT | `/api/superadmin/scores/{scoreId}/lock` | superAdminLockScore | Lock a score sheet | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | PUT | `/api/superadmin/scores/{scoreId}/players/{playerId}/unlock` | superAdminUnlockPlayerForJudges | Reopen one athlete for the judges | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | PUT | `/api/superadmin/scores/{scoreId}/unlock` | superAdminUnlockScore | Unlock a score sheet | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | GET | `/api/superadmin/scores/individual` | superAdminIndividualScores | Individual scores | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | POST | `/api/superadmin/scores/recalculate` | superAdminRecalculateScores | Recompute an age group | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | POST | `/api/superadmin/scores/save` | superAdminSaveScores | Write a slip or a score sheet | bearerAuth, cookieAuth |  | None | Not started |  |
| scoring | GET | `/api/superadmin/scores/team` | superAdminTeamScores | Team scores | bearerAuth, cookieAuth |  | None | Not started |  |
| stats | GET | `/api/stats/coach` | statsCoach | Published performances of every athlete on the coach's teams | bearerAuth, cookieAuth |  | None | Not started |  |
| stats | GET | `/api/stats/judge` | statsJudge | The signed-in judge's marking pattern | bearerAuth, cookieAuth |  | None | Not started |  |
| stats | GET | `/api/stats/judge-fairness` | statsJudgeFairness | Judge × team leans for a meet | bearerAuth, cookieAuth |  | None | Not started |  |
| stats | GET | `/api/stats/player` | statsPlayer | The signed-in player's published performances | bearerAuth, cookieAuth |  | None | Not started |  |
| team | POST | `/api/coaches/team` | coachCreateTeam | Create a team | bearerAuth, cookieAuth |  | None | Not started |  |
| team | GET | `/api/coaches/teams` | coachTeams | Own teams | bearerAuth, cookieAuth |  | None | Not started |  |
| team | GET | `/api/superadmin/teams` | superAdminListTeams | All teams | bearerAuth, cookieAuth |  | None | Not started |  |
| team | DELETE | `/api/superadmin/teams/{teamId}` | superAdminDeleteTeam | Delete a team | bearerAuth, cookieAuth |  | None | Not started |  |
| team | GET | `/api/superadmin/teams/{teamId}` | superAdminTeamDetails | Team detail | bearerAuth, cookieAuth |  | None | Not started |  |
| team | GET | `/api/teams` | listTeams | The calling coach's teams | bearerAuth, cookieAuth |  | None | Not started |  |
| team | POST | `/api/teams` | createTeam | Create a team | bearerAuth, cookieAuth |  | None | Not started |  |
| team | DELETE | `/api/teams/{id}` | deleteTeam | Delete a team | bearerAuth, cookieAuth |  | None | Not started |  |
| team | GET | `/api/teams/{id}` | getTeam | Team detail with roster | bearerAuth, cookieAuth |  | None | Not started |  |
| team | PUT | `/api/teams/{id}` | updateTeam | Update a team | bearerAuth, cookieAuth |  | None | Not started |  |
| team | GET | `/api/teams/{id}/stats` | teamStats | Team statistics | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | GET | `/api/desk/coaches` | deskFindCoach | Find returning coaches by name, email, phone or team name | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/coaches` | deskCreateCoach | Create a coach account at the desk | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | PUT | `/api/desk/coaches/{coachId}/player-default-password` | deskSetCoachDefaultPassword | Set a returning coach’s default player password | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/coaches/{coachId}/team` | deskEnsureTeam | Create the coach’s team unless they have one | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | GET | `/api/desk/drafts` | deskListDrafts | Unfinished walk-in forms at a meet | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/drafts` | deskOpenDraft | Enter the coach’s team in the meet and open (or resume) a form | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | DELETE | `/api/desk/drafts/{draftId}` | deskCancelDraft | Discard a form nobody was registered from | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | GET | `/api/desk/drafts/{draftId}` | deskGetDraft | A form with each row’s age, eligible groups and issues | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/drafts/{draftId}/payment/discount` | deskDiscountRedeem | Submit the entry with the discount code | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/drafts/{draftId}/payment/discount/quote` | deskDiscountQuote | Price the entry with the discount code | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/drafts/{draftId}/payment/order` | deskPaymentOrder | Razorpay order for the coach’s entry | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/drafts/{draftId}/payment/verify` | deskPaymentVerify | Verify the checkout and submit the team | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | PUT | `/api/desk/drafts/{draftId}/rows` | deskSaveRows | Save the review grid | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/drafts/{draftId}/scan` | deskScanPage | Read one photographed page into the form | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | GET | `/api/desk/drafts/{draftId}/slip` | deskSlip | The slip to hand the coach: Player IDs and payment | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | POST | `/api/desk/drafts/{draftId}/submit` | deskSubmit | Create and enter every player (resumable) | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | GET | `/api/desk/form` | deskFormPdf | The printable walk-in form (A4 PDF) — one form for every competition | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | GET | `/api/desk/meets` | deskOpenMeets | Meets whose fee window is open now | bearerAuth, cookieAuth |  | None | Not started |  |
| walkin | GET | `/api/desk/ocr/status` | deskOcrStatus | Is the form reader configured and answering? | bearerAuth, cookieAuth |  | None | Not started |  |
