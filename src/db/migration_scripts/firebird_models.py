from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class FBArticulo:
    reference: str
    description: str


@dataclass
class FBTarifa:
    articulo: str
    price: float


@dataclass
class FBAlbaran:
    id: int
    fecha: datetime
    cliente: int
    formapago: int | None
    spedido: str | None
    factura: int | None
    fechafactura: datetime | None


@dataclass
class FBPedVenta:
    id: int
    fecha: datetime
    cliente: int
    formapago: int | None
    spedido: str


@dataclass
class FBLinPedVenta:
    id: int
    articulo: str
    descripcion: str
    cantidad: int
    precio: float | None
    importe: float
    f_entrega: datetime
    pendientes: int


@dataclass
class FBCaracteristica:
    id: int
    articulo: str
    caracteristica: str


@dataclass
class FBCliente:
    id: int
    nombre: str
    nombrefiscal: str
    direccion: str
    localidad: str
    provincia: str
    codpostal: str
    pais: str
    telefono: str
    cif: str
    formapago: int | None
    iban: str | None
    ctaconta: str | None


@dataclass
class FBPago:
    id: str
    nombre: str
    dias_vencimiento: int
    genera_recibo: bool


@dataclass
class FBFactura:
    id: int
    fecha: datetime
    formapago: int | None
    cliente: int
    importe: float
    total: float
    contabilizado: bool
    vencimiento: datetime | None


@dataclass
class FBPvpEspecial:
    cliente: int
    articulo: str
    lote: int
    precio: float


@dataclass
class FBLinAlbaran:
    cliente: int
    articulo: str | None
    cantidad: int
    precio: float
    albaran: int
    descripcion: str
    id_pedido: int | None
    referencia_pedido_cliente: str | None
