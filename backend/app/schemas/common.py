from pydantic import BaseModel, ConfigDict


class LocationRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    locality: str
    country: str


class CircuitRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    circuitId: str
    circuitName: str
    Location: LocationRecord


class DriverRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    driverId: str
    givenName: str
    familyName: str
    nationality: str


class ConstructorRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    constructorId: str
    name: str
    nationality: str
