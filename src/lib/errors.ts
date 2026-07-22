export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(msg = 'Not found') { super(404, msg, 'NOT_FOUND') }
}

export class ConflictError extends AppError {
  constructor(msg = 'Already exists') { super(409, msg, 'CONFLICT') }
}

export class ForbiddenError extends AppError {
  constructor(msg = 'Forbidden') { super(403, msg, 'FORBIDDEN') }
}

export class ValidationError extends AppError {
  constructor(msg = 'Invalid input') { super(400, msg, 'VALIDATION') }
}

export class UnauthorizedError extends AppError {
  constructor(msg = 'Unauthorized') { super(401, msg, 'UNAUTHORIZED') }
}
