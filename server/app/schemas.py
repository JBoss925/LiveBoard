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


class CanvasRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parentId: str | None = None


class FolderRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FolderMoveRequest(BaseModel):
    parentId: str | None = None


class CanvasMoveFolderRequest(BaseModel):
    folderId: str | None = None


class DashboardOrderItem(BaseModel):
    type: str
    id: str


class DashboardReorderRequest(BaseModel):
    parentId: str | None = None
    items: list[DashboardOrderItem]


class CanvasFolderSummary(BaseModel):
    id: str
    name: str
    parentId: str | None = None
    sortOrder: int
    updatedAt: str


class CanvasSummary(BaseModel):
    id: str
    name: str
    ownerId: str
    ownerUsername: str
    folderId: str | None = None
    sortOrder: int
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
