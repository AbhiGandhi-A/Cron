# Admin Dashboard Documentation

## Overview

The Admin Dashboard provides comprehensive control over CronJob.io's core features:

- **User Management**: Block/unblock users, disable temporary email, view user details
- **Temporary Email Control**: Monitor mailboxes and emails, manage Cloudflare usage, cleanup expired mailboxes
- **Activity Audit Trail**: View all admin actions with IP addresses and timestamps
- **System Health**: Monitor MongoDB, Cloudflare Worker, and API health
- **Configuration**: View system settings and environment information

## Access

The admin dashboard is accessible at: `https://your-domain.com/admin`

### Authentication

Admin dashboard uses HTTP Basic/Bearer authentication with environment variable credentials.

**Credentials are set via environment variables** (never hardcoded):

```bash
ADMIN_USERNAME="admin"                    # Set your admin username
ADMIN_PASSWORD="your-secure-password"     # Set a strong password
```

### Login Process

1. Navigate to `/admin/login`
2. Enter `ADMIN_USERNAME` and `ADMIN_PASSWORD`
3. Click "Sign In"
4. Auth token is stored in browser localStorage
5. Token is automatically included in Authorization header for all API requests

## Features

### Dashboard (/)

The main dashboard displays real-time statistics:

- **User Management**: Total, active, and blocked users
- **Temporary Email**: Active mailboxes, expired mailboxes, total emails, today's activity
- **Job Scheduler**: Total jobs, active jobs, executions today, failed executions
- **Quick Actions**: Links to manage users, temp mail, and view activity

Statistics auto-refresh every 30 seconds.

### User Management (/users)

Complete user management interface with:

#### Search & Filter

- **Search**: Email or name (case-insensitive regex)
- **Status Filter**: Active or Blocked
- **Sort**: By creation date, name, or email
- **Pagination**: 20 users per page, customizable

#### User Actions

For each user, available actions:

- **Block User**: Prevents login and dashboard access
  - User cannot authenticate
  - Existing sessions remain valid until expiration
  - Logged to AdminAuditLog as `user_blocked`

- **Unblock User**: Re-enable user access
  - User can login normally
  - Logged to AdminAuditLog as `user_unblocked`

- **Disable Temp Mail**: Remove temporary email feature access
  - User cannot create new mailboxes
  - Existing mailboxes continue until expiration
  - New mailbox creation returns 403 error
  - Logged to AdminAuditLog as `temp_mail_disabled`

- **Enable Temp Mail**: Restore temporary email feature
  - User can create new mailboxes again
  - Logged to AdminAuditLog as `temp_mail_enabled`

- **Delete User**: Permanently remove user and all data
  - Cascades: deletes cron jobs, temp mailboxes, emails, executions
  - CANNOT BE UNDONE
  - Requires confirmation dialog
  - Logged to AdminAuditLog as `user_deleted`

#### User Details Modal

Click "Manage" to view:

- User email, name, account status
- Temporary email statistics (mailboxes count, email count)
- Recent admin activity targeting this user
- Action buttons for management

### Temporary Email Management (/temp-mail)

Monitor and control the temporary email system:

#### Statistics

- **Mailbox Status**: Total, active, expired, deleted mailboxes
- **Email Counts**: Total emails, emails created today
- **Storage**: Total bytes used, average email size
- **Cloudflare Usage**: Resource utilization percentages for Free Plan limits

#### Actions

**Clean Expired Mailboxes**
- Marks mailboxes past expiration as "expired"
- Cleans up storage
- Requires confirmation
- Logged to AdminAuditLog as `mailbox_cleaned`

#### Cloudflare Integration

If `TEMP_MAIL_SERVICE_URL` is configured:

Shows live usage for Cloudflare Free Plan resources:

- **Worker Requests**: 100k/day limit (90% safety threshold)
- **D1 Reads**: 5M/day limit (90% warning threshold)
- **D1 Writes**: 100k/day limit (95% block threshold)

Resource bars show:
- 🟢 Green (0-75%): Healthy
- 🟡 Yellow (75-90%): Warning
- 🔴 Red (90%+): Danger/Blocked

### Activity Log (/activity)

Comprehensive audit trail of all admin actions.

#### Logged Actions

All actions logged with:
- Timestamp
- Admin username/IP address
- Action type (login, block, unblock, etc.)
- Target user (if applicable)
- Success/failure status
- Error message (if failed)

#### Available Actions in Log

| Action | Description |
|--------|-------------|
| `admin_login` | Admin authenticated to dashboard |
| `user_blocked` | Admin blocked a user |
| `user_unblocked` | Admin unblocked a user |
| `temp_mail_disabled` | Admin disabled temp mail for user |
| `temp_mail_enabled` | Admin enabled temp mail for user |
| `user_deleted` | Admin deleted a user account |
| `mailbox_cleaned` | Admin cleaned up expired mailboxes |

#### Filters

- **Action Filter**: By action type
- **Time Period**: Last 24 hours, 7 days, 30 days, 90 days
- **Pagination**: 50 entries per page

### System Health (/health)

Real-time health monitoring for critical services.

#### Services Monitored

1. **MongoDB**: Database connectivity and response time
   - Status: OK or Error
   - Response time in milliseconds

2. **Cloudflare Worker**: Temp mail API worker health
   - Status: OK or Error
   - HTTP status code
   - Response time

3. **Next.js API**: Main application API
   - Status: Always OK if this page loads
   - Response time

#### Overall Status

Shows green banner if all services healthy, red if any issues detected.

### Settings (/settings)

System configuration information (read-only in dashboard).

#### Feature Flags

- **Temporary Email**: Enabled/disabled globally
- **Usage Protection**: Cloudflare Free Plan protection status

#### Resource Limits

Shows current thresholds for:
- **Safety Threshold**: Maximum allowed resource usage
- **Warning Threshold**: Alert level
- **Block Threshold**: Automatic blocking level

#### System Information

- **Environment**: production/development/staging
- **Version**: Application version
- **Refresh Interval**: Dashboard auto-refresh timing

**Note**: All settings are environment-variable-controlled. To change them:

1. Update `.env` or Vercel environment variables
2. Redeploy application
3. Settings will reflect new values automatically

## API Reference

### Authentication Header

All admin API requests require the Authorization header:

```
Authorization: Bearer <base64(username:password)>
```

Or using HTTP Basic Auth:

```
Authorization: Basic <base64(username:password)>
```

### Endpoints

#### Statistics
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/health` - System health status

#### Authentication
- `POST /api/admin/auth` - Login (returns auth token)
- `GET /api/admin/auth` - Verify session

#### User Management
- `GET /api/admin/users` - List users with filtering
- `GET /api/admin/users/[id]` - Get user details
- `POST /api/admin/users/[id]` - Perform user action (block/unblock/disable-temp-mail)
- `DELETE /api/admin/users/[id]` - Delete user

#### Temporary Email
- `GET /api/admin/temp-mail` - Temp mail statistics
- `POST /api/admin/temp-mail` - Perform action (clean-expired)

#### Activity
- `GET /api/admin/activity` - Get audit log with filtering

#### Configuration
- `GET /api/admin/settings` - Get system settings

## Deployment

### Environment Variables

Add to your deployment platform (Vercel):

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password-here
```

**Security Best Practices**:

1. Use strong, randomly-generated password (16+ characters)
2. Change password regularly
3. Use different admin credentials for different environments
4. Never commit credentials to version control
5. Consider rotating credentials quarterly

### Vercel Deployment

1. Push code to repository
2. Vercel auto-deploys
3. Add environment variables in Vercel dashboard:
   - Settings → Environment Variables
   - Add `ADMIN_USERNAME` and `ADMIN_PASSWORD`
4. Redeploy after adding variables
5. Access dashboard at `https://your-domain.com/admin`

## Security Considerations

### Authentication

- Uses timing-safe string comparison for credential validation
- Prevents timing attacks
- No secrets exposed in responses
- Bearer tokens stored in browser localStorage

### Authorization

- All admin endpoints require valid admin credentials
- Requests must include Authorization header
- Invalid/missing credentials return 401 Unauthorized
- All actions logged to AdminAuditLog

### Data Protection

- Passwords never returned in API responses
- Sensitive fields excluded from responses
- Admin IP addresses logged for audit trail
- All database queries use proper indexing

### Rate Limiting

Currently no built-in rate limiting on admin endpoints. Consider implementing:

1. Per-IP rate limiting (recommended: 100 req/min)
2. Per-user rate limiting for critical actions
3. Distributed rate limiting for Vercel deployments

## Troubleshooting

### Login Issues

**"Invalid credentials" error**:
- Verify `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set in environment
- Check that environment variables are deployed to Vercel
- For local development, ensure `.env` has correct values

**"Cannot connect to database"**:
- Check MongoDB connection string
- Verify IP whitelist includes Vercel deployment region
- Check `MONGODB_URI` is set correctly

### Missing Data

**No users showing in user list**:
- Check MongoDB connection
- Ensure users exist in database (run seed if needed)
- Check database permissions

**"Failed to fetch" errors**:
- Check browser console for detailed error messages
- Verify auth token in localStorage
- Check admin API endpoints are deployed

### Performance Issues

**Dashboard loads slowly**:
- Check MongoDB query performance
- Consider adding indexes (already done in models)
- Check Cloudflare Worker response time

## Maintenance

### Regular Tasks

1. **Review Activity Log**: Check for unusual admin actions (weekly)
2. **Clean Expired Mailboxes**: Click "Clean Expired" on Temp Mail page (weekly)
3. **Monitor Health**: Check System Health page (daily)
4. **Rotate Credentials**: Change admin password (quarterly)

### Database Maintenance

The admin dashboard relies on several MongoDB collections:

- `users` - User accounts with status and tempMailDisabled fields
- `temporarymailboxes` - Temp mailbox records
- `temporaryemails` - Received emails
- `admitauditlogs` - Admin action audit trail

All collections have proper indexes for query performance.

## API Response Examples

### GET /api/admin/stats

```json
{
  "users": {
    "total": 150,
    "active": 120,
    "blocked": 5
  },
  "tempMail": {
    "mailboxes": 45,
    "expiredMailboxes": 12,
    "totalEmails": 2340,
    "emailsToday": 156,
    "mailboxesToday": 8
  },
  "jobs": {
    "total": 234,
    "active": 189,
    "executionsToday": 1250,
    "failedToday": 3
  },
  "lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

### GET /api/admin/users

```json
{
  "users": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "status": "active",
      "tempMailDisabled": false,
      "plan": "free",
      "createdAt": "2024-01-10T15:30:00Z",
      "tempMailboxes": 2,
      "tempEmails": 45
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### POST /api/admin/users/[id]

```json
{
  "success": true,
  "message": "User blocked successfully",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "status": "blocked"
  }
}
```

## Support

For issues or questions:

1. Check this documentation first
2. Review browser console for error messages
3. Check `/admin/activity` log for recent actions
4. Check `/admin/health` for service status
5. Review server logs in Vercel deployment
