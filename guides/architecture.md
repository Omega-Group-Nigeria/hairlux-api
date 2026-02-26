# HairLux API - Code Structure Principles

## Architecture Overview
A **modular, layered design** inspired by enterprise patterns, promoting separation of concerns, maintainability, and scalability.

## Core Layers

### 1. **Routes Layer**
- Define API endpoints and HTTP methods
- Apply middleware (auth, validation, rate limiting)
- Route requests to appropriate controllers
- Keep thin - no business logic

### 2. **Controllers Layer**
- Handle HTTP request/response cycle
- Extract and pass data to services
- Format responses using standard response utilities
- Handle errors and return appropriate status codes
- **NO business logic** - only orchestration

### 3. **Services Layer**
- Contains **ALL business logic**
- Implements core application functionality
- Coordinates between multiple models/repositories
- Validates business rules
- Handles transactions and complex operations
- Independent of HTTP concerns (can be reused)

### 4. **Models/Repositories Layer**
- Define database schemas and relationships
- Handle direct database operations (CRUD)
- Encapsulate data access logic
- Return typed data structures

### 5. **DTOs (Data Transfer Objects)**
- Define request/response data shapes
- Validate incoming data (using validation libraries)
- Transform data between layers
- Ensure type safety across the application

### 6. **Interfaces/Types**
- Define TypeScript contracts for data structures
- Ensure type consistency across layers
- Document expected data shapes
- Enable better IDE support and compile-time checks

### 7. **Middleware**
- Handle cross-cutting concerns (authentication, logging, validation)
- Execute before controllers
- Reusable across multiple routes
- Keep focused and single-purpose

### 8. **Utilities**
- Pure helper functions with no side effects
- Reusable across the application
- **NO business logic** - only generic transformations
- Examples: date formatting, hashing, token generation

### 9. **Constants/Enums**
- Centralize configuration values
- Define status codes, error messages, and enums
- Avoid magic strings/numbers throughout codebase

## Key Principles

✅ **Separation of Concerns**: Each layer has one clear responsibility  
✅ **Dependency Flow**: Routes → Controllers → Services → Models  
✅ **Business Logic Isolation**: All logic lives in Services, never in Controllers  
✅ **Reusability**: Services can be used by multiple controllers  
✅ **Testability**: Each layer can be unit tested independently  
✅ **Type Safety**: DTOs and Interfaces enforce contracts  
✅ **Modularity**: Group related features together (auth, bookings, wallet)  
✅ **Scalability**: Easy to add new features without breaking existing code

## Request Flow
```
Request → Route → Middleware → Controller → Service → Model → Database
           ↓         ↓            ↓           ↓         ↓
        Define   Validate    Orchestrate  Business  Data
        Path     Request     Response     Logic     Access
```