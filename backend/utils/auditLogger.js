import AuditLog from '../models/AuditLog.js'

/**
 * Log an audit event
 */
export const logAudit = async ({
  user,               // ✅ changed
  action,
  resourceType,
  resourceId,
  details = {},
  req = null,
  status = 'success',
  errorMessage = null
}) => {
  try {
    if (!user) {
      return // hard guard — never write invalid audit logs
    }

    const auditData = {
      user,
      action,
      resourceType,
      resourceId,
      details,
      status,
      errorMessage
    }

    if (req) {
      auditData.ipAddress = req.ip || req.connection?.remoteAddress
      auditData.userAgent = req.get('user-agent')
    }

    await AuditLog.create(auditData)
  } catch (error) {
    console.error('Audit logging error:', error)
  }
}

export default logAudit
