from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: str
    username: str
    email: str


class AuthResponse(BaseModel):
    user: UserOut


class SignupRequest(BaseModel):
    username: str = Field(max_length=40)
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class LoginRequest(BaseModel):
    identifier: str = Field(max_length=200)
    password: str = Field(max_length=200)


class CanvasCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CanvasSummary(BaseModel):
    id: str
    name: str
    ownerId: str
    revision: int
    updatedAt: str


class CanvasDetail(CanvasSummary):
    state: dict


class InviteRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=200)


class InviteResponse(BaseModel):
    user: UserOut


class CanvasMembersResponse(BaseModel):
    users: list[UserOut]
