# TáComQuem Admin User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Admin Roles](#admin-roles)
3. [Managing Users](#managing-users)
4. [Content Moderation](#content-moderation)
5. [Analytics Dashboard](#analytics-dashboard)
6. [Admin Management](#admin-management)
7. [Audit Logs](#audit-logs)
8. [Best Practices](#best-practices)

---

## Getting Started

### Creating Your First Admin

Before you can use the admin system, you need to create a SUPER_ADMIN user.

1. Navigate to your project directory
2. Run the admin creation script:

```bash
bun run admin:create
```

3. Follow the prompts to enter:
   - **Email:** Your admin email address (e.g., `admin@tacq.com`)
   - **Password:** A strong password (minimum 8 characters)
   - **Full Name:** Your complete name (minimum 3 characters)

4. The system will confirm: `✅ SUPER_ADMIN criado com sucesso!`

### Logging In

Use your admin credentials to log in via the standard authentication endpoint:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tacq.com",
    "password": "your-password"
  }'
```

You'll receive an `accessToken` valid for 7 days.

---

## Admin Roles

The admin system includes 5 role levels with increasing permissions:

### 1. **USER** (Default)
- No admin permissions
- Can only manage their own items and loans

### 2. **ANALYST**
- Read-only access to platform analytics
- Can view dashboard statistics
- Can see aggregated user metrics
- **Restrictions:** Cannot modify any data

### 3. **SUPPORT**
- All ANALYST permissions +
- Can view user details (with masked PII)
- Can view item and loan details
- Can see user activity history
- **Purpose:** Customer support team members

### 4. **MODERATOR**
- All SUPPORT permissions +
- Can remove inappropriate items (soft delete)
- Can cancel fraudulent loans
- Can flag content
- **Purpose:** Content moderation team

### 5. **SUPER_ADMIN**
- Full platform access
- Can manage all admin users and their roles
- Can block/unblock regular users
- Can view complete audit logs
- **Responsibilities:** System administration and oversight

---

## Managing Users

### Viewing Users List

```bash
curl -X GET "http://localhost:3000/api/admin/users?limit=50&page=1" \
  -H "Authorization: Bearer <admin-token>"
```

**Query Parameters:**
- `page` (default: 1) - Page number for pagination
- `limit` (default: 50, max: 100) - Items per page
- `role` - Filter by user role (USER, ANALYST, SUPPORT, MODERATOR, SUPER_ADMIN)
- `isActive` - Filter by active/blocked status (true/false)
- `sortBy` - Sort by 'createdAt' or 'lastActivity'
- `sortOrder` - 'asc' or 'desc'

**Note:** User data is masked for LGPD compliance:
- Email: `jo***@gmail.com`
- Name: `João S***`

### Viewing User Details

Get detailed information about a specific user:

```bash
curl -X GET "http://localhost:3000/api/admin/users/{userId}" \
  -H "Authorization: Bearer <admin-token>"
```

Returns:
- Masked PII (email, name)
- Account status (active/blocked)
- Loan history (as lender and borrower)
- Items owned
- Account creation date

### Blocking a User

Block a user from accessing the platform (SUPER_ADMIN only):

```bash
curl -X POST "http://localhost:3000/api/admin/users/{userId}/block" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Suspicious activity pattern detected - multiple fake loans"
  }'
```

**Requirements:**
- Reason must be at least 10 characters
- Action is logged in the audit log with IP address
- Blocked user cannot access the platform

### Unblocking a User

Restore access for a previously blocked user:

```bash
curl -X POST "http://localhost:3000/api/admin/users/{userId}/unblock" \
  -H "Authorization: Bearer <admin-token>"
```

---

## Content Moderation

### Viewing Items

Get details about a specific item for review:

```bash
curl -X GET "http://localhost:3000/api/admin/moderation/items/{itemId}" \
  -H "Authorization: Bearer <admin-token>"
```

Returns:
- Item description and images
- Owner details (masked)
- Loan history
- Active loans

### Removing Items

Remove inappropriate items from the platform (MODERATOR+):

```bash
curl -X DELETE "http://localhost:3000/api/admin/moderation/items/{itemId}" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Potentially dangerous item - weapons category"
  }'
```

**Note:** This is a soft delete - the item is marked inactive but data is preserved.

### Canceling Loans

Cancel a fraudulent or problematic loan (MODERATOR+):

```bash
curl -X POST "http://localhost:3000/api/admin/moderation/loans/{loanId}/cancel" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Fraudulent loan - item value misrepresentation"
  }'
```

---

## Analytics Dashboard

### Viewing Dashboard

Get platform-wide statistics and trends:

```bash
curl -X GET "http://localhost:3000/api/admin/analytics/dashboard" \
  -H "Authorization: Bearer <admin-token>"
```

**Response includes:**
- Total users and active users
- Total items and active items
- Active loans vs. total loans
- New users and loans (last week)
- Return rate (last 30 days)

### User Statistics

Get detailed user demographics:

```bash
curl -X GET "http://localhost:3000/api/admin/analytics/users/stats" \
  -H "Authorization: Bearer <admin-token>"
```

### Loan Statistics

Get loan performance metrics:

```bash
curl -X GET "http://localhost:3000/api/admin/analytics/loans/stats" \
  -H "Authorization: Bearer <admin-token>"
```

---

## Admin Management

### Listing All Admins

View all administrative users (SUPER_ADMIN only):

```bash
curl -X GET "http://localhost:3000/api/admin/admins" \
  -H "Authorization: Bearer <admin-token>"
```

### Promoting a User to Admin

Grant admin role to a regular user:

```bash
curl -X POST "http://localhost:3000/api/admin/admins" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "existing-user-id",
    "role": "MODERATOR"
  }'
```

**Available roles:** ANALYST, SUPPORT, MODERATOR, SUPER_ADMIN

### Changing Admin Role

Update an admin's role (SUPER_ADMIN only):

```bash
curl -X PATCH "http://localhost:3000/api/admin/admins/{adminId}/role" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "SUPPORT"
  }'
```

### Removing Admin Access

Demote an admin back to USER role:

```bash
curl -X DELETE "http://localhost:3000/api/admin/admins/{adminId}" \
  -H "Authorization: Bearer <admin-token>"
```

---

## Audit Logs

### Viewing Audit Log

Track all administrative actions for compliance:

```bash
curl -X GET "http://localhost:3000/api/admin/admins/audit-log?page=1&limit=50" \
  -H "Authorization: Bearer <admin-token>"
```

**Query Parameters:**
- `page` - Pagination page
- `limit` - Items per page (max 100)
- `action` - Filter by action type (user_blocked, item_removed, etc.)
- `adminId` - Filter by admin who performed the action

**Logged Actions:**
- `user_blocked` - User was blocked
- `user_unblocked` - User was unblocked
- `item_removed` - Item was deleted
- `loan_cancelled` - Loan was cancelled
- `admin_created` - Admin user was created
- `admin_role_changed` - Admin role was updated
- `admin_removed` - Admin access was removed
- `content_flagged` - Content was flagged

**Each log entry includes:**
- Admin who performed the action
- Action type and reason
- IP address and user agent
- Timestamp
- Affected user/item/loan details

---

## Best Practices

### Security

1. **Use Strong Passwords**
   - Minimum 8 characters
   - Mix of uppercase, lowercase, numbers, and symbols
   - Unique per admin account

2. **Protect Your Token**
   - Don't share your access token
   - Tokens expire after 7 days (request new ones via refresh endpoint)
   - Treat like passwords

3. **Audit Log Review**
   - Regularly check audit logs for suspicious activities
   - Review actions taken by other admins
   - Monitor for bulk operations

### Operational

1. **User Blocking**
   - Provide clear, detailed reasons for blocking
   - Only block as a last resort after investigation
   - Document in notes or external ticket system
   - Consider contacting user before permanent action

2. **Item Removal**
   - Review item fully before removal
   - Use consistent, clear removal reasons
   - Soft deletes preserve data for disputes/appeals

3. **Admin Access Management**
   - Audit admin users regularly
   - Follow principle of least privilege
   - Remove access when roles change
   - Only grant SUPER_ADMIN to trusted individuals

4. **Analytics Review**
   - Weekly dashboard review for anomalies
   - Check return rates and fraud patterns
   - Monitor user growth trends
   - Investigate unusual spikes in activity

### Data Privacy (LGPD)

- **Masked Display:** Email and names are masked in all admin views
- **Encryption:** Personally identifiable data is encrypted at rest
- **Audit Trail:** All access is logged
- **Data Retention:** Follow applicable local data retention laws
- **User Rights:** Be prepared to facilitate data access/deletion requests

---

## Troubleshooting

### "Authentication required" error

**Cause:** Token is missing or invalid
**Solution:**
- Verify you're including the Bearer token in the Authorization header
- Request a new token via the refresh endpoint
- Check token hasn't expired (7 days)

### "Insufficient permissions" error

**Cause:** Your role doesn't have permission for this action
**Solution:**
- Check your admin role level
- Verify you're using the correct endpoint
- Contact a SUPER_ADMIN if you need role escalation

### User data showing as blank

**Cause:** Decryption or masking issue
**Solution:**
- Refresh the page/request
- Check user account exists
- Review audit logs for any encryption-related errors

---

## Support

For issues or questions:

1. Check the [admin system design](./plans/003-admin-backoffice/design.md) for technical details
2. Review [API specifications](./prd.md) for endpoint details
3. Contact the development team for bug reports

---

**Last Updated:** 2026-02-04
**System Version:** Phase 4 - QA & Documentation
